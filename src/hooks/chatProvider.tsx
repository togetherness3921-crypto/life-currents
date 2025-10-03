import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import {
  ChatContext,
  ChatThread,
  ChatContextValue,
  Message,
  MessageStore,
  NewMessageInput,
} from './chatProviderContext';
import { submitSupabaseOperation, flushSupabaseQueue } from '@/services/supabaseQueue';

const LEGACY_THREADS_KEY = 'chat_threads';
const LEGACY_MESSAGES_KEY = 'chat_messages';

type SupabaseThreadRow = {
  id: string;
  title: string | null;
  metadata: any;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseMessageRow = {
  id: string;
  thread_id: string;
  parent_id: string | null;
  role: string;
  content: string | null;
  thinking: string | null;
  tool_calls: any;
  created_at: string | null;
  updated_at: string | null;
};

type SupabaseDraftRow = {
  thread_id: string;
  draft_text: string | null;
  updated_at: string | null;
};

type LegacyThread = {
  id: string;
  title: string;
  leafMessageId: string | null;
  createdAt: string;
  selectedChildByMessageId: Record<string, string>;
  rootChildren: string[];
  selectedRootChild?: string;
};

type LegacyMessage = {
  id: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  children?: string[];
  toolCalls?: any[];
};

const nowIso = () => new Date().toISOString();

const convertToolCalls = (input: any): Message['toolCalls'] => {
  if (!Array.isArray(input)) return undefined;
  return input
    .map((item) => {
      if (!item) return null;
      return {
        id: String(item.id ?? uuidv4()),
        name: String(item.name ?? item.function?.name ?? 'tool'),
        arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {}),
        status: (item.status ?? 'success') as Message['toolCalls'][number]['status'],
        response: item.response,
        error: item.error,
      };
    })
    .filter(Boolean) as Message['toolCalls'];
};

const sanitiseThreadState = (
  threadId: string,
  messageStore: MessageStore,
  metadata: any
): Pick<ChatThread, 'leafMessageId' | 'selectedChildByMessageId' | 'rootChildren' | 'selectedRootChild'> => {
  const selectedChildByMessageId: Record<string, string> = {};
  const rawSelected = (metadata?.selectedChildByMessageId || {}) as Record<string, string>;
  for (const [parentId, childId] of Object.entries(rawSelected)) {
    if (messageStore[parentId] && messageStore[childId]) {
      selectedChildByMessageId[parentId] = childId;
    }
  }

  const allRootMessages = Object.values(messageStore)
    .filter((message) => message.parentId === null && message.threadId === threadId)
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))
    .map((message) => message.id);

  const rootChildren = Array.isArray(metadata?.rootChildren)
    ? (metadata.rootChildren as string[]).filter((id: string) => allRootMessages.includes(id))
    : allRootMessages;

  const selectedRootChild = metadata?.selectedRootChild && messageStore[metadata.selectedRootChild]
    ? metadata.selectedRootChild
    : rootChildren[rootChildren.length - 1];

  let leafMessageId: string | null = metadata?.leafMessageId && messageStore[metadata.leafMessageId]
    ? metadata.leafMessageId
    : null;

  const traverseForLeaf = () => {
    let current = selectedRootChild ?? rootChildren[rootChildren.length - 1];
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const currentMessage = messageStore[current];
      if (!currentMessage || currentMessage.children.length === 0) {
        return current;
      }
      const preferredChild = selectedChildByMessageId[current]
        || currentMessage.children[currentMessage.children.length - 1];
      if (!preferredChild || !messageStore[preferredChild]) {
        return current;
      }
      current = preferredChild;
    }
    return current ?? null;
  };

  if (!leafMessageId) {
    leafMessageId = traverseForLeaf();
  }

  return {
    leafMessageId: leafMessageId ?? null,
    selectedChildByMessageId,
    rootChildren,
    selectedRootChild,
  };
};

const parseMessageRows = (rows: SupabaseMessageRow[]): MessageStore => {
  const store: MessageStore = {};
  rows.forEach((row) => {
    const createdAt = row.created_at ? new Date(row.created_at) : undefined;
    const updatedAt = row.updated_at ? new Date(row.updated_at) : createdAt;
    const baseMessage: Message = {
      id: row.id,
      parentId: row.parent_id,
      role: (row.role ?? 'assistant') as Message['role'],
      content: row.content ?? '',
      thinking: row.thinking ?? undefined,
      children: [],
      toolCalls: convertToolCalls(row.tool_calls),
      createdAt,
      updatedAt,
      threadId: row.thread_id,
    };
    store[row.id] = baseMessage;
  });

  rows.forEach((row) => {
    if (row.parent_id && store[row.parent_id]) {
      store[row.parent_id].children.push(row.id);
    }
  });

  Object.values(store).forEach((message) => {
    message.children = message.children.sort((a, b) => {
      const aDate = store[a]?.createdAt?.getTime() ?? 0;
      const bDate = store[b]?.createdAt?.getTime() ?? 0;
      return aDate - bDate;
    });
  });

  return store;
};

const legacyMessagesToSupabase = (
  legacyMessages: Record<string, LegacyMessage>,
  messageIds: string[],
  threadId: string
): SupabaseMessageRow[] => {
  const rows: SupabaseMessageRow[] = [];
  messageIds.forEach((messageId) => {
    const message = legacyMessages[messageId];
    if (!message) return;
    rows.push({
      id: message.id,
      thread_id: threadId,
      parent_id: message.parentId,
      role: message.role,
      content: message.content,
      thinking: message.thinking ?? null,
      tool_calls: message.toolCalls ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });
  return rows;
};

const gatherThreadMessageIds = (
  thread: LegacyThread,
  messages: Record<string, LegacyMessage>
): string[] => {
  const result = new Set<string>();
  const queue = [...(thread.rootChildren ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || result.has(current)) continue;
    result.add(current);
    const message = messages[current];
    if (message?.children && Array.isArray(message.children)) {
      for (const child of message.children) {
        if (child && !result.has(child)) {
          queue.push(child);
        }
      }
    }
  }
  if (thread.leafMessageId) {
    result.add(thread.leafMessageId);
  }
  return Array.from(result);
};

const toChatThread = (
  row: SupabaseThreadRow,
  messageStore: MessageStore
): ChatThread => {
  const metadata = row.metadata ?? {};
  const sanitised = sanitiseThreadState(row.id, messageStore, metadata);
  return {
    id: row.id,
    title: row.title ?? 'New Chat',
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    leafMessageId: sanitised.leafMessageId,
    selectedChildByMessageId: sanitised.selectedChildByMessageId,
    rootChildren: sanitised.rootChildren,
    selectedRootChild: sanitised.selectedRootChild ?? undefined,
  };
};

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<MessageStore>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const messagePersistTimers = useRef<Record<string, number>>({});
  const pendingMessagePayloads = useRef<Record<string, Message>>({});
  const draftPersistTimers = useRef<Record<string, number>>({});
  const pendingDraftValues = useRef<Record<string, string>>({});

  const scheduleMessagePersist = useCallback((message: Message) => {
    pendingMessagePayloads.current[message.id] = message;
    if (messagePersistTimers.current[message.id]) {
      window.clearTimeout(messagePersistTimers.current[message.id]);
    }
    messagePersistTimers.current[message.id] = window.setTimeout(() => {
      const payload = pendingMessagePayloads.current[message.id];
      if (!payload) return;
      const updateFields: Record<string, unknown> = {
        content: payload.content,
        thinking: payload.thinking ?? null,
        tool_calls: payload.toolCalls && payload.toolCalls.length > 0 ? payload.toolCalls : null,
        updated_at: nowIso(),
      };
      void submitSupabaseOperation('chat.update_message', { id: payload.id, fields: updateFields });
      delete pendingMessagePayloads.current[message.id];
      delete messagePersistTimers.current[message.id];
    }, 600);
  }, []);

  const scheduleDraftPersist = useCallback((threadId: string, text: string) => {
    pendingDraftValues.current[threadId] = text;
    if (draftPersistTimers.current[threadId]) {
      window.clearTimeout(draftPersistTimers.current[threadId]);
    }
    draftPersistTimers.current[threadId] = window.setTimeout(() => {
      const value = pendingDraftValues.current[threadId] ?? '';
      if (value.trim().length === 0) {
        void submitSupabaseOperation('chat.delete_draft', { thread_id: threadId });
      } else {
        void submitSupabaseOperation('chat.upsert_draft', {
          thread_id: threadId,
          draft_text: value,
          updated_at: nowIso(),
        });
      }
      delete pendingDraftValues.current[threadId];
      delete draftPersistTimers.current[threadId];
    }, 400);
  }, []);

  const migrateLegacyData = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      const legacyThreadsRaw = window.localStorage.getItem(LEGACY_THREADS_KEY);
      const legacyMessagesRaw = window.localStorage.getItem(LEGACY_MESSAGES_KEY);
      if (!legacyThreadsRaw || !legacyMessagesRaw) return;

      const parsedThreads: LegacyThread[] = JSON.parse(legacyThreadsRaw);
      const parsedMessages: Record<string, LegacyMessage> = JSON.parse(legacyMessagesRaw);

      if (!Array.isArray(parsedThreads) || parsedThreads.length === 0) return;

      for (const legacyThread of parsedThreads) {
        await submitSupabaseOperation('chat.upsert_thread', {
          id: legacyThread.id,
          title: legacyThread.title,
          metadata: {
            leafMessageId: legacyThread.leafMessageId,
            selectedChildByMessageId: legacyThread.selectedChildByMessageId,
            rootChildren: legacyThread.rootChildren,
            selectedRootChild: legacyThread.selectedRootChild ?? null,
          },
          created_at: legacyThread.createdAt,
          updated_at: nowIso(),
        });
        const messageIds = gatherThreadMessageIds(legacyThread, parsedMessages);
        const messageRows = legacyMessagesToSupabase(parsedMessages, messageIds, legacyThread.id);
        for (const row of messageRows) {
          await submitSupabaseOperation('chat.upsert_message', row);
        }
      }

      window.localStorage.removeItem(LEGACY_THREADS_KEY);
      window.localStorage.removeItem(LEGACY_MESSAGES_KEY);
    } catch (error) {
      console.warn('[ChatProvider] Legacy migration failed', error);
    }
  }, []);

  useEffect(() => {
    void flushSupabaseQueue();
  }, []);

  useEffect(() => {
    let isCancelled = false;
    const load = async () => {
      try {
        const { data: threadRows, error: threadError } = await supabase
          .from('chat_threads')
          .select('*')
          .order('created_at', { ascending: true });

        if (threadError) throw threadError;

        if (!threadRows || threadRows.length === 0) {
          await migrateLegacyData();
        }

        const { data: refreshedThreads, error: refreshedError } = await supabase
          .from('chat_threads')
          .select('*')
          .order('created_at', { ascending: true });
        if (refreshedError) throw refreshedError;

        const { data: messageRows, error: messageError } = await supabase
          .from('chat_messages')
          .select('*');
        if (messageError) throw messageError;

        const { data: draftRows, error: draftError } = await supabase
          .from('chat_drafts')
          .select('*');
        if (draftError) throw draftError;

        const messageStore = parseMessageRows((messageRows ?? []) as SupabaseMessageRow[]);

        const parsedThreads = (refreshedThreads ?? []).map((row) =>
          toChatThread(row as SupabaseThreadRow, messageStore)
        );

        const draftsMap = (draftRows ?? []).reduce((acc, row) => {
          const draft = row as SupabaseDraftRow;
          acc[draft.thread_id] = draft.draft_text ?? '';
          return acc;
        }, {} as Record<string, string>);

        if (!isCancelled) {
          setMessages(messageStore);
          setThreads(parsedThreads);
          setDrafts(draftsMap);
          setIsLoaded(true);
          setActiveThreadId((current) => {
            if (current && parsedThreads.some((thread) => thread.id === current)) {
              return current;
            }
            const mostRecent = parsedThreads[parsedThreads.length - 1]?.id ?? null;
            return mostRecent;
          });
        }
      } catch (error) {
        console.error('[ChatProvider] Failed to load chat data', error);
        if (!isCancelled) {
          setThreads([]);
          setMessages({});
          setDrafts({});
          setIsLoaded(true);
        }
      }
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [migrateLegacyData]);

  useEffect(() => {
    return () => {
      Object.values(messagePersistTimers.current).forEach((timer) => window.clearTimeout(timer));
      Object.values(draftPersistTimers.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const getThread = useCallback((id: string) => threads.find((thread) => thread.id === id), [threads]);

  const getMessageChain = useCallback(
    (leafId: string | null): Message[] => {
      if (!leafId) return [];
      const chain: Message[] = [];
      let currentId: string | null = leafId;
      const visited = new Set<string>();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const message = messages[currentId];
        if (!message) break;
        chain.unshift(message);
        currentId = message.parentId;
      }
      return chain;
    },
    [messages]
  );

  const persistThreadMetadata = useCallback((thread: ChatThread) => {
    const metadata = {
      leafMessageId: thread.leafMessageId,
      selectedChildByMessageId: thread.selectedChildByMessageId,
      rootChildren: thread.rootChildren,
      selectedRootChild: thread.selectedRootChild ?? null,
    };
    void submitSupabaseOperation('chat.upsert_thread', {
      id: thread.id,
      title: thread.title,
      metadata,
      created_at: thread.createdAt.toISOString(),
      updated_at: nowIso(),
    });
  }, []);

  const updateThreadState = useCallback(
    (threadId: string, updater: (thread: ChatThread) => ChatThread): ChatThread | null => {
      let updatedThread: ChatThread | null = null;
      setThreads((previous) =>
        previous.map((thread) => {
          if (thread.id !== threadId) return thread;
          const next = updater(thread);
          updatedThread = next;
          return next;
        })
      );
      return updatedThread;
    },
    []
  );

  const createThread = useCallback(() => {
    const id = uuidv4();
    const now = new Date();
    const newThread: ChatThread = {
      id,
      title: 'New Chat',
      leafMessageId: null,
      createdAt: now,
      selectedChildByMessageId: {},
      rootChildren: [],
      selectedRootChild: undefined,
    };
    setThreads((previous) => [...previous, newThread]);
    setActiveThreadId(id);
    void submitSupabaseOperation('chat.upsert_thread', {
      id,
      title: newThread.title,
      metadata: {
        leafMessageId: null,
        selectedChildByMessageId: {},
        rootChildren: [],
        selectedRootChild: null,
      },
      created_at: now.toISOString(),
      updated_at: nowIso(),
    });
    return id;
  }, []);

  const addMessage = useCallback(
    (threadId: string, messageData: NewMessageInput): Message => {
      const id = uuidv4();
      const createdAt = new Date();
      const newMessage: Message = {
        id,
        parentId: messageData.parentId,
        role: messageData.role,
        content: messageData.content,
        thinking: messageData.thinking,
        children: [],
        toolCalls: messageData.toolCalls ? [...messageData.toolCalls] : [],
        createdAt,
        updatedAt: createdAt,
        threadId,
      };

      setMessages((previous) => {
        const updated: MessageStore = { ...previous, [id]: newMessage };
        if (messageData.parentId && previous[messageData.parentId]) {
          updated[messageData.parentId] = {
            ...previous[messageData.parentId],
            children: [...previous[messageData.parentId].children, id],
          };
        }
        return updated;
      });

      const updatedThread = updateThreadState(threadId, (thread) => {
        const selectedChildByMessageId = { ...thread.selectedChildByMessageId };
        let rootChildren = [...thread.rootChildren];
        let selectedRootChild = thread.selectedRootChild;

        if (messageData.parentId) {
          selectedChildByMessageId[messageData.parentId] = id;
        } else {
          rootChildren = [...rootChildren, id];
          selectedRootChild = id;
        }

        return {
          ...thread,
          leafMessageId: id,
          selectedChildByMessageId,
          rootChildren,
          selectedRootChild,
        };
      });

      void submitSupabaseOperation('chat.upsert_message', {
        id,
        thread_id: threadId,
        parent_id: messageData.parentId,
        role: messageData.role,
        content: messageData.content,
        thinking: messageData.thinking ?? null,
        tool_calls: newMessage.toolCalls && newMessage.toolCalls.length > 0 ? newMessage.toolCalls : null,
        created_at: createdAt.toISOString(),
        updated_at: createdAt.toISOString(),
      });

      if (updatedThread) {
        persistThreadMetadata(updatedThread);
      }

      return newMessage;
    },
    [persistThreadMetadata, updateThreadState]
  );

  const updateMessage = useCallback(
    (messageId: string, updates: Partial<Message> | ((message: Message) => Partial<Message>)) => {
      setMessages((previous) => {
        const current = previous[messageId];
        if (!current) return previous;
        const applied = typeof updates === 'function' ? updates(current) : updates;
        const next: Message = {
          ...current,
          ...applied,
          updatedAt: new Date(),
        };
        const updatedStore: MessageStore = { ...previous, [messageId]: next };
        scheduleMessagePersist(next);
        return updatedStore;
      });
    },
    [scheduleMessagePersist]
  );

  const selectBranch = useCallback(
    (threadId: string | null, parentId: string | null, childId: string) => {
      if (!threadId) return;
      const updatedThread = updateThreadState(threadId, (thread) => {
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
          const selectedChild = selectedChildByMessageId[nextLeaf] ?? message.children[message.children.length - 1];
          if (!selectedChild) break;
          selectedChildByMessageId[nextLeaf] = selectedChild;
          nextLeaf = selectedChild;
        }

        return {
          ...thread,
          selectedChildByMessageId,
          selectedRootChild,
          leafMessageId: nextLeaf || childId,
        };
      });

      if (updatedThread) {
        persistThreadMetadata(updatedThread);
      }
    },
    [messages, persistThreadMetadata, updateThreadState]
  );

  const updateThreadTitle = useCallback(
    (threadId: string, title: string) => {
      const updatedThread = updateThreadState(threadId, (thread) => ({
        ...thread,
        title,
      }));
      if (updatedThread) {
        persistThreadMetadata(updatedThread);
      }
    },
    [persistThreadMetadata, updateThreadState]
  );

  const updateDraft = useCallback(
    (threadId: string, text: string) => {
      setDrafts((previous) => ({ ...previous, [threadId]: text }));
      scheduleDraftPersist(threadId, text);
    },
    [scheduleDraftPersist]
  );

  const clearDraft = useCallback((threadId: string) => {
    setDrafts((previous) => {
      const updated = { ...previous };
      delete updated[threadId];
      return updated;
    });
    if (draftPersistTimers.current[threadId]) {
      window.clearTimeout(draftPersistTimers.current[threadId]);
      delete draftPersistTimers.current[threadId];
    }
    delete pendingDraftValues.current[threadId];
    void submitSupabaseOperation('chat.delete_draft', { thread_id: threadId });
  }, []);

  const value: ChatContextValue = useMemo(
    () => ({
      threads,
      messages,
      drafts,
      activeThreadId,
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
    }),
    [threads, messages, drafts, activeThreadId, getThread, createThread, addMessage, getMessageChain, updateMessage, selectBranch, updateThreadTitle, updateDraft, clearDraft]
  );

  if (!isLoaded) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading chats...</div>;
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

