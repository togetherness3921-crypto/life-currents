import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import {
  ChatContext,
  ChatContextValue,
  ChatThread,
  Message,
  MessageStore,
  ToolCallState,
} from './chatProviderContext';

const THREADS_STORAGE_KEY = 'chat_threads';
const MESSAGES_STORAGE_KEY = 'chat_messages';
const DRAFTS_STORAGE_KEY = 'chat_drafts';
const ACTIVE_THREAD_STORAGE_KEY = 'chat_active_thread_id';
const PENDING_OPS_STORAGE_KEY = 'chat_pending_ops_v1';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

type ThreadMetadata = {
  leafMessageId: string | null;
  selectedChildByMessageId: Record<string, string>;
  rootChildren: string[];
  selectedRootChild?: string | null;
};

type ThreadRowPayload = {
  id: string;
  title: string | null;
  metadata: ThreadMetadata;
  created_at: string;
  updated_at: string;
};

type MessageRowPayload = {
  id: string;
  thread_id: string;
  parent_id: string | null;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  thinking: string | null;
  tool_calls: ToolCallState[] | null;
  created_at: string;
  updated_at: string;
};

type DraftRowPayload = {
  thread_id: string;
  draft_text: string;
  updated_at: string;
};

type PendingOperation =
  | { kind: 'upsertThread'; payload: ThreadRowPayload }
  | { kind: 'upsertMessage'; payload: MessageRowPayload }
  | { kind: 'upsertDraft'; payload: DraftRowPayload }
  | { kind: 'deleteDraft'; threadId: string };

const buildThreadMetadata = (thread: ChatThread): ThreadMetadata => ({
  leafMessageId: thread.leafMessageId,
  selectedChildByMessageId: thread.selectedChildByMessageId,
  rootChildren: thread.rootChildren,
  selectedRootChild: thread.selectedRootChild ?? null,
});

const toThreadRow = (thread: ChatThread): ThreadRowPayload => ({
  id: thread.id,
  title: thread.title,
  metadata: buildThreadMetadata(thread),
  created_at: thread.createdAt.toISOString(),
  updated_at: thread.updatedAt.toISOString(),
});

const toMessageRow = (message: Message): MessageRowPayload => ({
  id: message.id,
  thread_id: message.threadId,
  parent_id: message.parentId,
  role: message.role,
  content: message.content,
  thinking: message.thinking ?? null,
  tool_calls: message.toolCalls && message.toolCalls.length > 0 ? message.toolCalls : null,
  created_at: message.createdAt ? message.createdAt.toISOString() : new Date().toISOString(),
  updated_at: message.updatedAt ? message.updatedAt.toISOString() : new Date().toISOString(),
});

const toDraftRow = (threadId: string, draft: string): DraftRowPayload => ({
  thread_id: threadId,
  draft_text: draft,
  updated_at: new Date().toISOString(),
});

type LocalStateBundle = {
  threads: ChatThread[];
  messages: MessageStore;
  drafts: Record<string, string>;
  pendingOperations: PendingOperation[];
};

const sanitizeToolCalls = (value: unknown): ToolCallState[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return undefined;
      const item = entry as ToolCallState;
      if (!item.id || !item.name) return undefined;
      return {
        id: String(item.id),
        name: String(item.name),
        arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? ''),
        status: item.status === 'success' || item.status === 'error' || item.status === 'running' ? item.status : 'pending',
        response: item.response,
        error: item.error,
      } satisfies ToolCallState;
    })
    .filter(Boolean) as ToolCallState[];
};

const assignMissingThreadIds = (threads: ChatThread[], messages: MessageStore) => {
  const lookup: Record<string, string> = {};
  threads.forEach((thread) => {
    const stack = [...(thread.rootChildren ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      lookup[id] = thread.id;
      const message = messages[id];
      if (message) {
        message.children?.forEach((childId) => stack.push(childId));
      }
    }
  });

  const resolveFromParents = (message: Message, seen = new Set<string>()): string | null => {
    if (message.threadId) return message.threadId;
    if (!message.parentId) return null;
    if (seen.has(message.parentId)) return null;
    seen.add(message.parentId);
    const parent = messages[message.parentId];
    if (!parent) return null;
    return resolveFromParents(parent, seen);
  };

  Object.values(messages).forEach((message) => {
    if (!message.threadId) {
      message.threadId = lookup[message.id] ?? resolveFromParents(message) ?? threads[threads.length - 1]?.id ?? message.threadId ?? '';
    }
    if (!Array.isArray(message.children)) {
      message.children = [];
    }
    if (!message.toolCalls) {
      message.toolCalls = [];
    }
  });
};

const readLocalState = (): LocalStateBundle => {
  if (!isBrowser) {
    return { threads: [], messages: {}, drafts: {}, pendingOperations: [] };
  }

  try {
    const rawThreads = window.localStorage.getItem(THREADS_STORAGE_KEY);
    const rawMessages = window.localStorage.getItem(MESSAGES_STORAGE_KEY);
    const rawDrafts = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
    const rawPending = window.localStorage.getItem(PENDING_OPS_STORAGE_KEY);

    const parsedThreads = rawThreads ? JSON.parse(rawThreads) : [];
    const parsedMessages = rawMessages ? JSON.parse(rawMessages) : {};
    const parsedDrafts = rawDrafts ? JSON.parse(rawDrafts) : {};
    const parsedPending = rawPending ? JSON.parse(rawPending) : [];

    const threads: ChatThread[] = Array.isArray(parsedThreads)
      ? parsedThreads.map((thread: any) => ({
          id: thread.id,
          title: typeof thread.title === 'string' ? thread.title : 'New Chat',
          leafMessageId: thread.leafMessageId ?? null,
          createdAt: thread.createdAt ? new Date(thread.createdAt) : new Date(),
          updatedAt: thread.updatedAt ? new Date(thread.updatedAt) : new Date(),
          selectedChildByMessageId: thread.selectedChildByMessageId ?? {},
          rootChildren: Array.isArray(thread.rootChildren) ? thread.rootChildren : [],
          selectedRootChild: thread.selectedRootChild ?? undefined,
        }))
      : [];

    const messageStore: MessageStore = {};
    if (parsedMessages && typeof parsedMessages === 'object') {
      Object.entries(parsedMessages as Record<string, any>).forEach(([id, value]) => {
        if (!value || typeof value !== 'object') return;
        messageStore[id] = {
          id,
          threadId: value.threadId ?? '',
          parentId: value.parentId ?? null,
          role: value.role ?? 'user',
          content: value.content ?? '',
          thinking: value.thinking ?? undefined,
          children: Array.isArray(value.children) ? [...value.children] : [],
          toolCalls: sanitizeToolCalls(value.toolCalls) ?? [],
          createdAt: value.createdAt ? new Date(value.createdAt) : undefined,
          updatedAt: value.updatedAt ? new Date(value.updatedAt) : undefined,
        };
      });
    }

    assignMissingThreadIds(threads, messageStore);

    const drafts: Record<string, string> = {};
    if (parsedDrafts && typeof parsedDrafts === 'object') {
      Object.entries(parsedDrafts as Record<string, unknown>).forEach(([threadId, value]) => {
        if (typeof value === 'string') {
          drafts[threadId] = value;
        }
      });
    }

    const pendingOperations: PendingOperation[] = Array.isArray(parsedPending)
      ? (parsedPending
          .map((operation) => {
            if (!operation || typeof operation !== 'object') return null;
            const op = operation as PendingOperation;
            if (op.kind === 'upsertThread' && op.payload && typeof op.payload === 'object') {
              return op;
            }
            if (op.kind === 'upsertMessage' && op.payload && typeof op.payload === 'object') {
              return op;
            }
            if (op.kind === 'upsertDraft' && op.payload && typeof op.payload === 'object') {
              return op;
            }
            if (op.kind === 'deleteDraft' && typeof op.threadId === 'string') {
              return op;
            }
            return null;
          })
          .filter(Boolean) as PendingOperation[])
      : [];

    return { threads, messages: messageStore, drafts, pendingOperations };
  } catch (error) {
    console.warn('[ChatProvider] Failed to parse local chat state', error);
    return { threads: [], messages: {}, drafts: {}, pendingOperations: [] };
  }
};

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const initialLocal = useMemo(readLocalState, []);
  const initialStateRef = useRef(initialLocal);
  const pendingOperationsRef = useRef<PendingOperation[]>(initialLocal.pendingOperations);
  const isFlushingRef = useRef(false);

  const [threads, setThreads] = useState<ChatThread[]>(initialLocal.threads);
  const [messages, setMessages] = useState<MessageStore>(initialLocal.messages);
  const [drafts, setDrafts] = useState<Record<string, string>>(initialLocal.drafts);
  const [activeThreadIdState, setActiveThreadIdState] = useState<string | null>(() => {
    if (!isBrowser) {
      return initialLocal.threads[initialLocal.threads.length - 1]?.id ?? null;
    }
    const stored = window.localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY);
    if (stored && initialLocal.threads.some((thread) => thread.id === stored)) {
      return stored;
    }
    return initialLocal.threads[initialLocal.threads.length - 1]?.id ?? null;
  });

  useEffect(() => {
    if (!isBrowser) return;
    const serializable = threads.map((thread) => ({
      ...thread,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
    }));
    window.localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(serializable));
  }, [threads]);

  useEffect(() => {
    if (!isBrowser) return;
    const serializable = Object.fromEntries(
      Object.entries(messages).map(([id, message]) => [
        id,
        {
          id: message.id,
          threadId: message.threadId,
          parentId: message.parentId,
          role: message.role,
          content: message.content,
          thinking: message.thinking ?? null,
          children: message.children,
          toolCalls: message.toolCalls ?? [],
          createdAt: message.createdAt ? message.createdAt.toISOString() : null,
          updatedAt: message.updatedAt ? message.updatedAt.toISOString() : null,
        },
      ]),
    );
    window.localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(serializable));
  }, [messages]);

  useEffect(() => {
    if (!isBrowser) return;
    window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  }, [drafts]);

  const persistPendingOperations = useCallback(() => {
    if (!isBrowser) return;
    window.localStorage.setItem(PENDING_OPS_STORAGE_KEY, JSON.stringify(pendingOperationsRef.current));
  }, []);

  const executeOperation = useCallback(async (operation: PendingOperation) => {
    try {
      if (operation.kind === 'upsertThread') {
        const { error } = await (supabase as any)
          .from('chat_threads')
          .upsert([operation.payload]);
        if (error) throw error;
      } else if (operation.kind === 'upsertMessage') {
        const { error } = await (supabase as any)
          .from('chat_messages')
          .upsert([operation.payload], { onConflict: 'id' });
        if (error) throw error;
      } else if (operation.kind === 'upsertDraft') {
        const { error } = await (supabase as any)
          .from('chat_drafts')
          .upsert([operation.payload], { onConflict: 'thread_id' });
        if (error) throw error;
      } else if (operation.kind === 'deleteDraft') {
        const { error } = await (supabase as any)
          .from('chat_drafts')
          .delete()
          .eq('thread_id', operation.threadId);
        if (error) throw error;
      }
      return true;
    } catch (error) {
      console.error('[ChatProvider] Failed to execute pending operation', error, operation);
      return false;
    }
  }, []);

  const flushPendingOperations = useCallback(async () => {
    if (!navigator.onLine) return;
    if (isFlushingRef.current) return;
    isFlushingRef.current = true;
    try {
      while (pendingOperationsRef.current.length > 0) {
        const operation = pendingOperationsRef.current[0];
        const success = await executeOperation(operation);
        if (!success) break;
        pendingOperationsRef.current = pendingOperationsRef.current.slice(1);
        persistPendingOperations();
      }
    } finally {
      isFlushingRef.current = false;
    }
  }, [executeOperation, persistPendingOperations]);

  const enqueueOperation = useCallback(
    (operation: PendingOperation) => {
      const queue = [...pendingOperationsRef.current];
      let replaced = false;
      if (operation.kind === 'upsertThread') {
        const index = queue.findIndex((item) => item.kind === 'upsertThread' && item.payload.id === operation.payload.id);
        if (index >= 0) {
          queue[index] = operation;
          replaced = true;
        }
      } else if (operation.kind === 'upsertMessage') {
        const index = queue.findIndex((item) => item.kind === 'upsertMessage' && item.payload.id === operation.payload.id);
        if (index >= 0) {
          queue[index] = operation;
          replaced = true;
        }
      } else if (operation.kind === 'upsertDraft') {
        const index = queue.findIndex((item) => item.kind === 'upsertDraft' && item.payload.thread_id === operation.payload.thread_id);
        if (index >= 0) {
          queue[index] = operation;
          replaced = true;
        }
      } else if (operation.kind === 'deleteDraft') {
        const upsertIndex = queue.findIndex((item) => item.kind === 'upsertDraft' && item.payload.thread_id === operation.threadId);
        if (upsertIndex >= 0) {
          queue.splice(upsertIndex, 1);
        }
      }
      if (!replaced && operation.kind !== 'deleteDraft') {
        queue.push(operation);
      } else if (operation.kind === 'deleteDraft') {
        queue.push(operation);
      }
      pendingOperationsRef.current = queue;
      persistPendingOperations();
      if (navigator.onLine) {
        flushPendingOperations();
      }
    },
    [flushPendingOperations, persistPendingOperations],
  );

  useEffect(() => {
    if (navigator.onLine) {
      flushPendingOperations();
    }
  }, [flushPendingOperations]);

  useEffect(() => {
    const handleOnline = () => flushPendingOperations();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushPendingOperations]);

  const persistThreadRemotely = useCallback(
    (thread: ChatThread) => {
      const payload = toThreadRow(thread);
      (async () => {
        try {
          const { error } = await (supabase as any).from('chat_threads').upsert([payload]);
          if (error) throw error;
          flushPendingOperations();
        } catch (error) {
          console.error('[ChatProvider] Failed to persist thread', error, thread.id);
          enqueueOperation({ kind: 'upsertThread', payload });
        }
      })();
    },
    [enqueueOperation, flushPendingOperations],
  );

  const persistMessageRemotely = useCallback(
    (message: Message) => {
      const payload = toMessageRow(message);
      (async () => {
        try {
          const { error } = await (supabase as any)
            .from('chat_messages')
            .upsert([payload], { onConflict: 'id' });
          if (error) throw error;
          flushPendingOperations();
        } catch (error) {
          console.error('[ChatProvider] Failed to persist message', error, message.id);
          enqueueOperation({ kind: 'upsertMessage', payload });
        }
      })();
    },
    [enqueueOperation, flushPendingOperations],
  );

  const persistDraftRemotely = useCallback(
    (threadId: string, draft: string) => {
      const payload = toDraftRow(threadId, draft);
      (async () => {
        try {
          const { error } = await (supabase as any)
            .from('chat_drafts')
            .upsert([payload], { onConflict: 'thread_id' });
          if (error) throw error;
          flushPendingOperations();
        } catch (error) {
          console.error('[ChatProvider] Failed to persist draft', error, threadId);
          enqueueOperation({ kind: 'upsertDraft', payload });
        }
      })();
    },
    [enqueueOperation, flushPendingOperations],
  );

  const deleteDraftRemotely = useCallback(
    (threadId: string) => {
      (async () => {
        try {
          const { error } = await (supabase as any)
            .from('chat_drafts')
            .delete()
            .eq('thread_id', threadId);
          if (error) throw error;
          flushPendingOperations();
        } catch (error) {
          console.error('[ChatProvider] Failed to delete draft', error, threadId);
          enqueueOperation({ kind: 'deleteDraft', threadId });
        }
      })();
    },
    [enqueueOperation, flushPendingOperations],
  );

  const migrateLocalToSupabase = useCallback(async () => {
    const { threads: localThreads, messages: localMessages, drafts: localDrafts } = initialStateRef.current;
    if (localThreads.length === 0 && Object.keys(localMessages).length === 0 && Object.keys(localDrafts).length === 0) {
      return;
    }

    try {
      if (localThreads.length > 0) {
        const threadRows = localThreads.map(toThreadRow);
        const { error } = await (supabase as any).from('chat_threads').upsert(threadRows);
        if (error) throw error;
      }

      const messageRows = Object.values(localMessages).map(toMessageRow);
      if (messageRows.length > 0) {
        const { error } = await (supabase as any)
          .from('chat_messages')
          .upsert(messageRows, { onConflict: 'id' });
        if (error) throw error;
      }

      const draftRows = Object.entries(localDrafts).map(([threadId, draft]) => toDraftRow(threadId, draft));
      if (draftRows.length > 0) {
        const { error } = await (supabase as any)
          .from('chat_drafts')
          .upsert(draftRows, { onConflict: 'thread_id' });
        if (error) throw error;
      }
    } catch (error) {
      console.error('[ChatProvider] Failed to migrate local chats to Supabase', error);
    }
  }, []);

  const loadFromSupabase = useCallback(async () => {
    try {
      const [threadResult, messageResult, draftResult] = await Promise.all([
        (supabase as any)
          .from('chat_threads')
          .select('id, title, metadata, created_at, updated_at')
          .order('created_at', { ascending: true }),
        (supabase as any)
          .from('chat_messages')
          .select('id, thread_id, parent_id, role, content, thinking, tool_calls, created_at, updated_at')
          .order('created_at', { ascending: true }),
        (supabase as any)
          .from('chat_drafts')
          .select('thread_id, draft_text, updated_at'),
      ]);

      if (threadResult.error) throw threadResult.error;
      if (messageResult.error) throw messageResult.error;
      if (draftResult.error) throw draftResult.error;

      const threadRows = threadResult.data ?? [];
      if (threadRows.length === 0 && initialStateRef.current.threads.length > 0) {
        await migrateLocalToSupabase();
        return loadFromSupabase();
      }

      const remoteThreads: ChatThread[] = threadRows.map((row: any) => ({
        id: row.id,
        title: row.title ?? 'New Chat',
        leafMessageId: row.metadata?.leafMessageId ?? null,
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
        selectedChildByMessageId: row.metadata?.selectedChildByMessageId ?? {},
        rootChildren: Array.isArray(row.metadata?.rootChildren) ? row.metadata.rootChildren : [],
        selectedRootChild: row.metadata?.selectedRootChild ?? undefined,
      }));

      const remoteMessages: MessageStore = {};
      (messageResult.data ?? []).forEach((row: any) => {
        remoteMessages[row.id] = {
          id: row.id,
          threadId: row.thread_id,
          parentId: row.parent_id,
          role: row.role,
          content: row.content ?? '',
          thinking: row.thinking ?? undefined,
          children: [],
          toolCalls: sanitizeToolCalls(row.tool_calls) ?? [],
          createdAt: row.created_at ? new Date(row.created_at) : undefined,
          updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        };
      });

      Object.values(remoteMessages).forEach((message) => {
        if (message.parentId && remoteMessages[message.parentId]) {
          remoteMessages[message.parentId] = {
            ...remoteMessages[message.parentId],
            children: [...remoteMessages[message.parentId].children, message.id],
          };
        }
      });

      Object.values(remoteMessages).forEach((message) => {
        if (message.children.length > 1) {
          message.children.sort((a, b) => {
            const aTime = remoteMessages[a]?.createdAt?.getTime() ?? 0;
            const bTime = remoteMessages[b]?.createdAt?.getTime() ?? 0;
            return aTime - bTime;
          });
        }
      });

      const remoteDrafts: Record<string, string> = {};
      (draftResult.data ?? []).forEach((row: any) => {
        if (typeof row.draft_text === 'string') {
          remoteDrafts[row.thread_id] = row.draft_text;
        }
      });

      setThreads(remoteThreads);
      setMessages(remoteMessages);
      setDrafts(remoteDrafts);

      setActiveThreadIdState((prev) => {
        if (prev && remoteThreads.some((thread) => thread.id === prev)) {
          return prev;
        }
        const stored = isBrowser ? window.localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY) : null;
        if (stored && remoteThreads.some((thread) => thread.id === stored)) {
          return stored;
        }
        return remoteThreads.length > 0 ? remoteThreads[remoteThreads.length - 1].id : null;
      });

      flushPendingOperations();
    } catch (error) {
      console.error('[ChatProvider] Failed to load chats from Supabase', error);
    }
  }, [flushPendingOperations, migrateLocalToSupabase]);

  useEffect(() => {
    loadFromSupabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveThreadId = useCallback((id: string | null) => {
    setActiveThreadIdState(id);
    if (!isBrowser) return;
    if (id) {
      window.localStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_THREAD_STORAGE_KEY);
    }
  }, []);

  const getThread = useCallback((id: string) => threads.find((thread) => thread.id === id), [threads]);

  const createThread = useCallback(() => {
    const id = uuidv4();
    const now = new Date();
    const newThread: ChatThread = {
      id,
      title: 'New Chat',
      leafMessageId: null,
      createdAt: now,
      updatedAt: now,
      selectedChildByMessageId: {},
      rootChildren: [],
      selectedRootChild: undefined,
    };
    setThreads((prev) => [...prev, newThread]);
    setActiveThreadId(id);
    persistThreadRemotely(newThread);
    return id;
  }, [persistThreadRemotely, setActiveThreadId]);

  const getMessageChain = useCallback(
    (leafId: string | null): Message[] => {
      if (!leafId) return [];
      const chain: Message[] = [];
      const visited = new Set<string>();
      let current: string | null = leafId;
      while (current) {
        if (visited.has(current)) break;
        visited.add(current);
        const message = messages[current];
        if (!message) break;
        chain.unshift(message);
        current = message.parentId;
      }
      return chain;
    },
    [messages],
  );

  const addMessage: ChatContextValue['addMessage'] = useCallback(
    (threadId, messageData) => {
      const id = uuidv4();
      const now = new Date();
      const toolCalls = messageData.toolCalls ?? [];
      const newMessage: Message = {
        id,
        threadId,
        parentId: messageData.parentId ?? null,
        role: messageData.role,
        content: messageData.content,
        thinking: messageData.thinking,
        children: [],
        toolCalls,
        createdAt: now,
        updatedAt: now,
      };

      setMessages((prev) => {
        const next: MessageStore = {
          ...prev,
          [id]: newMessage,
        };
        if (messageData.parentId && prev[messageData.parentId]) {
          next[messageData.parentId] = {
            ...prev[messageData.parentId],
            children: [...prev[messageData.parentId].children, id],
          };
        }
        return next;
      });

      let threadToPersist: ChatThread | null = null;
      setThreads((prev) =>
        prev.map((thread) => {
          if (thread.id !== threadId) return thread;
          const selectedChildByMessageId = { ...thread.selectedChildByMessageId };
          const rootChildren = [...thread.rootChildren];
          let selectedRootChild = thread.selectedRootChild;
          if (messageData.parentId) {
            selectedChildByMessageId[messageData.parentId] = id;
          } else {
            rootChildren.push(id);
            selectedRootChild = id;
          }
          const updatedThread: ChatThread = {
            ...thread,
            title:
              thread.title === 'New Chat' && messageData.role === 'user'
                ? `${messageData.content.substring(0, 30)}...`
                : thread.title,
            leafMessageId: id,
            selectedChildByMessageId,
            rootChildren,
            selectedRootChild,
            updatedAt: now,
          };
          threadToPersist = updatedThread;
          return updatedThread;
        }),
      );

      if (threadToPersist) {
        persistThreadRemotely(threadToPersist);
      }
      persistMessageRemotely(newMessage);
      return newMessage;
    },
    [persistMessageRemotely, persistThreadRemotely],
  );

  const updateMessage: ChatContextValue['updateMessage'] = useCallback(
    (messageId, updates) => {
      let nextMessage: Message | null = null;
      setMessages((prev) => {
        const current = prev[messageId];
        if (!current) return prev;
        const applied = typeof updates === 'function' ? updates(current) : updates;
        nextMessage = {
          ...current,
          ...applied,
          updatedAt: new Date(),
        };
        return {
          ...prev,
          [messageId]: nextMessage!,
        };
      });
      if (nextMessage) {
        persistMessageRemotely(nextMessage);
      }
    },
    [persistMessageRemotely],
  );

  const selectBranch: ChatContextValue['selectBranch'] = useCallback(
    (threadId, parentId, childId) => {
      if (!threadId) return;
      let threadToPersist: ChatThread | null = null;
      setThreads((prev) =>
        prev.map((thread) => {
          if (thread.id !== threadId) return thread;
          const selectedChildByMessageId = { ...thread.selectedChildByMessageId };
          let selectedRootChild = thread.selectedRootChild;
          if (parentId) {
            selectedChildByMessageId[parentId] = childId;
          } else {
            selectedRootChild = childId;
          }
          let nextLeaf: string | undefined | null = childId;
          const visited = new Set<string>();
          while (nextLeaf && !visited.has(nextLeaf)) {
            visited.add(nextLeaf);
            const message = messages[nextLeaf];
            if (!message || message.children.length === 0) break;
            const chosen = selectedChildByMessageId[nextLeaf] ?? message.children[message.children.length - 1];
            selectedChildByMessageId[nextLeaf] = chosen;
            nextLeaf = chosen;
          }
          const updatedThread: ChatThread = {
            ...thread,
            selectedChildByMessageId,
            selectedRootChild,
            leafMessageId: nextLeaf || childId,
            updatedAt: new Date(),
          };
          threadToPersist = updatedThread;
          return updatedThread;
        }),
      );
      if (threadToPersist) {
        persistThreadRemotely(threadToPersist);
      }
    },
    [messages, persistThreadRemotely],
  );

  const updateThreadTitle: ChatContextValue['updateThreadTitle'] = useCallback(
    (threadId, title) => {
      let threadToPersist: ChatThread | null = null;
      setThreads((prev) =>
        prev.map((thread) => {
          if (thread.id !== threadId) return thread;
          const updatedThread: ChatThread = {
            ...thread,
            title,
            updatedAt: new Date(),
          };
          threadToPersist = updatedThread;
          return updatedThread;
        }),
      );
      if (threadToPersist) {
        persistThreadRemotely(threadToPersist);
      }
    },
    [persistThreadRemotely],
  );

  const updateDraft: ChatContextValue['updateDraft'] = useCallback(
    (threadId, text) => {
      const trimmed = text.trim();
      setDrafts((prev) => {
        if (trimmed.length === 0) {
          if (!(threadId in prev)) return prev;
          const next = { ...prev };
          delete next[threadId];
          return next;
        }
        return { ...prev, [threadId]: text };
      });
      if (trimmed.length === 0) {
        deleteDraftRemotely(threadId);
      } else {
        persistDraftRemotely(threadId, text);
      }
    },
    [deleteDraftRemotely, persistDraftRemotely],
  );

  const clearDraft: ChatContextValue['clearDraft'] = useCallback(
    (threadId) => {
      setDrafts((prev) => {
        if (!(threadId in prev)) return prev;
        const next = { ...prev };
        delete next[threadId];
        return next;
      });
      deleteDraftRemotely(threadId);
    },
    [deleteDraftRemotely],
  );

  const refreshFromServer = useCallback(async () => {
    await loadFromSupabase();
  }, [loadFromSupabase]);

  const value: ChatContextValue = {
    threads,
    messages,
    drafts,
    activeThreadId: activeThreadIdState,
    setActiveThreadId,
    getThread,
    createThread,
    addMessage,
    getMessageChain,
    updateMessage,
    selectBranch,
    updateThreadTitle,
    updateDraft,
    clearDraft,
    refreshFromServer,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

