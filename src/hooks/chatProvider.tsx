import { ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    ChatContext,
    Message,
    ChatThread,
    ChatContextValue,
    ChatThreadMetadata,
} from './chatProviderContext';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';

const THREADS_STORAGE_KEY = 'chat_threads';
const MESSAGES_STORAGE_KEY = 'chat_messages';
const DRAFTS_STORAGE_KEY = 'chat_drafts';
const PENDING_OPS_STORAGE_KEY = 'chat_pending_ops_v1';

type PendingOperation =
    | { type: 'upsert_thread'; payload: TablesInsert<'chat_threads'> }
    | { type: 'upsert_message'; payload: TablesInsert<'chat_messages'> }
    | { type: 'upsert_draft'; payload: TablesInsert<'chat_drafts'> }
    | { type: 'delete_draft'; payload: { thread_id: string } };

type MessageWithThread = Message & { threadId: string };

type MessageRecord = Record<string, MessageWithThread>;

type DraftRecord = Record<string, string>;

const toISO = (value: Date | undefined | null): string | null => {
    if (!value) return null;
    try {
        return value.toISOString();
    } catch (error) {
        return null;
    }
};

const parseDate = (value: string | null | undefined, fallback: Date): Date => {
    if (!value) return fallback;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const normalizeThreadFromStorage = (thread: any): ChatThread => {
    const created = thread?.createdAt ? new Date(thread.createdAt) : new Date();
    const updated = thread?.updatedAt ? new Date(thread.updatedAt) : created;
    const rootChildren = Array.isArray(thread?.rootChildren) ? thread.rootChildren : [];
    return {
        id: thread?.id ?? uuidv4(),
        title: thread?.title ?? 'New Chat',
        createdAt: created,
        updatedAt: updated,
        leafMessageId: thread?.leafMessageId ?? null,
        rootChildren,
        selectedRootChild: thread?.selectedRootChild ?? (rootChildren.length > 0 ? rootChildren[rootChildren.length - 1] : undefined),
        selectedChildByMessageId: thread?.selectedChildByMessageId ?? {},
    };
};

const normalizeMessageFromStorage = (id: string, message: any): MessageWithThread => {
    const created = message?.createdAt ? new Date(message.createdAt) : undefined;
    const updated = message?.updatedAt ? new Date(message.updatedAt) : created;
    return {
        id,
        threadId: message?.threadId ?? '',
        parentId: message?.parentId ?? null,
        role: message?.role ?? 'user',
        content: message?.content ?? '',
        thinking: message?.thinking ?? undefined,
        children: Array.isArray(message?.children) ? [...message.children] : [],
        toolCalls: Array.isArray(message?.toolCalls) ? [...message.toolCalls] : [],
        createdAt: created,
        updatedAt: updated,
    };
};

const loadStoredThreads = (): ChatThread[] => {
    try {
        const raw = localStorage.getItem(THREADS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeThreadFromStorage);
    } catch (error) {
        console.error('Failed to parse threads from localStorage', error);
        return [];
    }
};

const loadStoredMessages = (): MessageRecord => {
    try {
        const raw = localStorage.getItem(MESSAGES_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return {};
        const entries = Object.entries(parsed) as Array<[string, any]>;
        const result: MessageRecord = {};
        for (const [id, value] of entries) {
            result[id] = normalizeMessageFromStorage(id, value);
        }
        return result;
    } catch (error) {
        console.error('Failed to parse messages from localStorage', error);
        return {};
    }
};

const loadStoredDrafts = (): DraftRecord => {
    try {
        const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return {};
        return parsed as DraftRecord;
    } catch (error) {
        console.error('Failed to parse drafts from localStorage', error);
        return {};
    }
};

const saveStoredThreads = (threads: ChatThread[]) => {
    try {
        const serialized = threads.map((thread) => ({
            ...thread,
            createdAt: thread.createdAt.toISOString(),
            updatedAt: thread.updatedAt.toISOString(),
        }));
        localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
        console.error('Failed to save threads to localStorage', error);
    }
};

const saveStoredMessages = (messages: MessageRecord) => {
    try {
        const serialized: Record<string, any> = {};
        Object.entries(messages).forEach(([id, msg]) => {
            serialized[id] = {
                ...msg,
                createdAt: toISO(msg.createdAt),
                updatedAt: toISO(msg.updatedAt),
            };
        });
        localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
        console.error('Failed to save messages to localStorage', error);
    }
};

const saveStoredDrafts = (drafts: DraftRecord) => {
    try {
        localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch (error) {
        console.error('Failed to save drafts to localStorage', error);
    }
};

const loadPendingOperations = (): PendingOperation[] => {
    try {
        const raw = localStorage.getItem(PENDING_OPS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed as PendingOperation[];
    } catch (error) {
        console.error('Failed to parse pending chat operations', error);
        return [];
    }
};

const savePendingOperations = (operations: PendingOperation[]) => {
    try {
        if (!operations.length) {
            localStorage.removeItem(PENDING_OPS_STORAGE_KEY);
        } else {
            localStorage.setItem(PENDING_OPS_STORAGE_KEY, JSON.stringify(operations));
        }
    } catch (error) {
        console.error('Failed to persist pending chat operations', error);
    }
};

const ensureThreadMetadata = (thread: ChatThread): ChatThreadMetadata => ({
    leafMessageId: thread.leafMessageId ?? null,
    rootChildren: Array.isArray(thread.rootChildren) ? thread.rootChildren : [],
    selectedChildByMessageId: thread.selectedChildByMessageId ?? {},
    selectedRootChild: thread.selectedRootChild,
});

const toThreadRow = (thread: ChatThread): TablesInsert<'chat_threads'> => ({
    id: thread.id,
    title: thread.title,
    metadata: ensureThreadMetadata(thread),
    created_at: thread.createdAt.toISOString(),
    updated_at: thread.updatedAt.toISOString(),
});

const toMessageRow = (message: MessageWithThread): TablesInsert<'chat_messages'> => ({
    id: message.id,
    thread_id: message.threadId,
    parent_id: message.parentId,
    role: message.role,
    content: message.content,
    thinking: message.thinking ?? null,
    tool_calls: message.toolCalls ?? null,
    created_at: message.createdAt ? message.createdAt.toISOString() : null,
    updated_at: message.updatedAt ? message.updatedAt.toISOString() : new Date().toISOString(),
});

const toDraftRow = (threadId: string, draftText: string): TablesInsert<'chat_drafts'> => ({
    thread_id: threadId,
    draft_text: draftText,
    updated_at: new Date().toISOString(),
});

const assignThreadIdsFromRoots = (threads: ChatThread[], messages: MessageRecord) => {
    const visited = new Set<string>();
    const visit = (messageId: string, threadId: string) => {
        if (visited.has(messageId)) return;
        visited.add(messageId);
        const message = messages[messageId];
        if (!message) return;
        message.threadId = threadId;
        if (!Array.isArray(message.children)) {
            message.children = [];
        }
        message.children.forEach((childId) => visit(childId, threadId));
    };

    threads.forEach((thread) => {
        thread.rootChildren.forEach((childId) => visit(childId, thread.id));
    });
};

const buildMessageStore = (messages: MessageWithThread[]): MessageRecord => {
    const store: MessageRecord = {};
    messages.forEach((msg) => {
        store[msg.id] = {
            ...msg,
            children: [],
        };
    });
    messages.forEach((msg) => {
        if (msg.parentId && store[msg.parentId]) {
            store[msg.parentId].children.push(msg.id);
        }
    });
    return store;
};

const mergeMessages = (primary: MessageRecord, secondary: MessageRecord): MessageRecord => {
    const merged: MessageRecord = { ...primary };
    Object.entries(secondary).forEach(([id, message]) => {
        if (!merged[id]) {
            merged[id] = { ...message, children: [...message.children] };
        }
    });

    // Rebuild children to ensure consistency
    Object.values(merged).forEach((message) => {
        message.children = [];
    });
    Object.values(merged).forEach((message) => {
        if (message.parentId && merged[message.parentId]) {
            merged[message.parentId].children.push(message.id);
        }
    });
    return merged;
};

export const ChatProvider = ({ children }: { children: ReactNode }) => {
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [messages, setMessages] = useState<MessageRecord>({});
    const [drafts, setDrafts] = useState<DraftRecord>({});
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const pendingOperationsRef = useRef<PendingOperation[]>(loadPendingOperations());
    const flushInFlightRef = useRef<Promise<void> | null>(null);
    const initializedRef = useRef(false);

    const applyOperation = useCallback(async (operation: PendingOperation) => {
        switch (operation.type) {
            case 'upsert_thread': {
                const { error } = await supabase.from('chat_threads').upsert(operation.payload);
                if (error) throw error;
                return;
            }
            case 'upsert_message': {
                const { error } = await supabase.from('chat_messages').upsert(operation.payload);
                if (error) throw error;
                return;
            }
            case 'upsert_draft': {
                const { error } = await supabase.from('chat_drafts').upsert(operation.payload);
                if (error) throw error;
                return;
            }
            case 'delete_draft': {
                const { error } = await supabase.from('chat_drafts').delete().eq('thread_id', operation.payload.thread_id);
                if (error) throw error;
                return;
            }
            default:
                return;
        }
    }, []);

    const flushPendingOperations = useCallback(async () => {
        if (flushInFlightRef.current) {
            await flushInFlightRef.current;
            return;
        }
        const run = async () => {
            while (pendingOperationsRef.current.length > 0) {
                const operation = pendingOperationsRef.current[0];
                try {
                    await applyOperation(operation);
                    pendingOperationsRef.current = pendingOperationsRef.current.slice(1);
                    savePendingOperations(pendingOperationsRef.current);
                } catch (error) {
                    console.warn('[ChatProvider] Failed to flush pending operation, will retry later', error);
                    break;
                }
            }
        };
        flushInFlightRef.current = run();
        try {
            await flushInFlightRef.current;
        } finally {
            flushInFlightRef.current = null;
        }
    }, [applyOperation]);

    const enqueueOperation = useCallback((operation: PendingOperation) => {
        pendingOperationsRef.current = [...pendingOperationsRef.current, operation];
        savePendingOperations(pendingOperationsRef.current);
    }, []);

    const attemptOperation = useCallback(
        async (operation: PendingOperation) => {
            try {
                await applyOperation(operation);
                await flushPendingOperations();
            } catch (error) {
                console.warn('[ChatProvider] Queueing operation due to error', error);
                enqueueOperation(operation);
            }
        },
        [applyOperation, enqueueOperation, flushPendingOperations]
    );

    useEffect(() => {
        const localThreads = loadStoredThreads();
        const localMessages = loadStoredMessages();
        const localDrafts = loadStoredDrafts();

        assignThreadIdsFromRoots(localThreads, localMessages);
        setThreads(localThreads);
        setMessages(localMessages);
        setDrafts(localDrafts);

        const fetchRemote = async () => {
            try {
                const [threadsRes, messagesRes, draftsRes] = await Promise.all([
                    supabase.from('chat_threads').select('*'),
                    supabase.from('chat_messages').select('*'),
                    supabase.from('chat_drafts').select('*'),
                ]);

                if (threadsRes.error) throw threadsRes.error;
                if (messagesRes.error) throw messagesRes.error;
                if (draftsRes.error) throw draftsRes.error;

                const remoteThreads = (threadsRes.data || []).map((row) => ({
                    id: row.id,
                    title: row.title ?? 'New Chat',
                    createdAt: parseDate(row.created_at, new Date()),
                    updatedAt: parseDate(row.updated_at, new Date()),
                    leafMessageId: (row.metadata as ChatThreadMetadata | null)?.leafMessageId ?? null,
                    rootChildren: (row.metadata as ChatThreadMetadata | null)?.rootChildren ?? [],
                    selectedChildByMessageId: (row.metadata as ChatThreadMetadata | null)?.selectedChildByMessageId ?? {},
                    selectedRootChild: (row.metadata as ChatThreadMetadata | null)?.selectedRootChild ?? undefined,
                } as ChatThread));

                const remoteMessagesArray: MessageWithThread[] = (messagesRes.data || []).map((row) => ({
                    id: row.id,
                    threadId: row.thread_id,
                    parentId: row.parent_id,
                    role: row.role as Message['role'],
                    content: row.content ?? '',
                    thinking: row.thinking ?? undefined,
                    toolCalls: Array.isArray(row.tool_calls) ? row.tool_calls : undefined,
                    children: [],
                    createdAt: row.created_at ? new Date(row.created_at) : undefined,
                    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
                }));

                const remoteMessages = buildMessageStore(remoteMessagesArray);
                const remoteDrafts: DraftRecord = {};
                (draftsRes.data || []).forEach((row) => {
                    remoteDrafts[row.thread_id] = row.draft_text ?? '';
                });

                const remoteThreadIds = new Set(remoteThreads.map((thread) => thread.id));
                const remoteMessageIds = new Set(Object.keys(remoteMessages));

                const missingThreads = localThreads.filter((thread) => !remoteThreadIds.has(thread.id));
                const missingMessages = Object.values(localMessages).filter((message) => !remoteMessageIds.has(message.id));
                const missingDraftEntries = Object.entries(localDrafts).filter(([threadId]) => remoteDrafts[threadId] === undefined);

                await Promise.all([
                    ...missingThreads.map((thread) => attemptOperation({ type: 'upsert_thread', payload: toThreadRow(thread) })),
                    ...missingMessages.map((message) => attemptOperation({ type: 'upsert_message', payload: toMessageRow(message) })),
                    ...missingDraftEntries.map(([threadId, draftText]) =>
                        attemptOperation({ type: 'upsert_draft', payload: toDraftRow(threadId, draftText) })
                    ),
                ]);

                const mergedThreadsMap = new Map<string, ChatThread>();
                remoteThreads.forEach((thread) => mergedThreadsMap.set(thread.id, thread));
                missingThreads.forEach((thread) => mergedThreadsMap.set(thread.id, thread));
                const mergedThreads = Array.from(mergedThreadsMap.values()).sort(
                    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
                );

                const mergedMessages = mergeMessages(remoteMessages, buildMessageStore(missingMessages));
                assignThreadIdsFromRoots(mergedThreads, mergedMessages);

                const mergedDrafts: DraftRecord = { ...remoteDrafts };
                missingDraftEntries.forEach(([threadId, draftText]) => {
                    mergedDrafts[threadId] = draftText;
                });

                setThreads(mergedThreads);
                setMessages(mergedMessages);
                setDrafts(mergedDrafts);
                initializedRef.current = true;
            } catch (error) {
                console.error('[ChatProvider] Failed to load remote chat data', error);
                initializedRef.current = true;
            }
        };

        fetchRemote();
    }, [attemptOperation]);

    useEffect(() => {
        const handleOnline = () => {
            flushPendingOperations();
        };
        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [flushPendingOperations]);

    useEffect(() => {
        if (!initializedRef.current) return;
        saveStoredThreads(threads);
    }, [threads]);

    useEffect(() => {
        if (!initializedRef.current) return;
        saveStoredMessages(messages);
    }, [messages]);

    useEffect(() => {
        if (!initializedRef.current) return;
        saveStoredDrafts(drafts);
    }, [drafts]);

    const getThread = useCallback((id: string) => threads.find((thread) => thread.id === id), [threads]);

    const getMessageChain = useCallback(
        (leafId: string | null): Message[] => {
            if (!leafId) return [];
            const chain: Message[] = [];
            let current: string | null = leafId;
            while (current) {
                const message = messages[current];
                if (!message) break;
                chain.unshift(message);
                current = message.parentId;
            }
            return chain;
        },
        [messages]
    );

    const createThread = useCallback(() => {
        const timestamp = new Date();
        const newThread: ChatThread = {
            id: uuidv4(),
            title: 'New Chat',
            createdAt: timestamp,
            updatedAt: timestamp,
            leafMessageId: null,
            rootChildren: [],
            selectedChildByMessageId: {},
            selectedRootChild: undefined,
        };
        setThreads((prev) => [...prev, newThread]);
        setActiveThreadId(newThread.id);
        attemptOperation({ type: 'upsert_thread', payload: toThreadRow(newThread) });
        return newThread.id;
    }, [attemptOperation]);

    const addMessage = useCallback<ChatContextValue['addMessage']>(
        (threadId, messageData) => {
            const newId = messageData.id ?? uuidv4();
            const timestamp = new Date();
            const newMessage: MessageWithThread = {
                id: newId,
                threadId,
                parentId: messageData.parentId ?? null,
                role: messageData.role,
                content: messageData.content,
                thinking: messageData.thinking,
                toolCalls: messageData.toolCalls ? [...messageData.toolCalls] : [],
                children: [],
                createdAt: timestamp,
                updatedAt: timestamp,
            };

            let updatedThread: ChatThread | null = null;
            setMessages((prev) => {
                const next = { ...prev, [newId]: newMessage };
                if (newMessage.parentId && next[newMessage.parentId]) {
                    next[newMessage.parentId] = {
                        ...next[newMessage.parentId],
                        children: [...new Set([...next[newMessage.parentId].children, newId])],
                        updatedAt: timestamp,
                    };
                }
                return next;
            });

            setThreads((prev) =>
                prev.map((thread) => {
                    if (thread.id !== threadId) return thread;
                    const selectedChildByMessageId = { ...thread.selectedChildByMessageId };
                    let rootChildren = [...thread.rootChildren];
                    let selectedRootChild = thread.selectedRootChild;

                    if (newMessage.parentId) {
                        selectedChildByMessageId[newMessage.parentId] = newId;
                    } else {
                        rootChildren = [...rootChildren, newId];
                        selectedRootChild = newId;
                    }

                    const updated: ChatThread = {
                        ...thread,
                        title:
                            thread.title === 'New Chat' && newMessage.role === 'user'
                                ? `${newMessage.content.substring(0, 30)}...`
                                : thread.title,
                        leafMessageId: newId,
                        selectedChildByMessageId,
                        rootChildren,
                        selectedRootChild,
                        updatedAt: timestamp,
                    };
                    updatedThread = updated;
                    return updated;
                })
            );

            attemptOperation({ type: 'upsert_message', payload: toMessageRow(newMessage) });
            if (updatedThread) {
                attemptOperation({ type: 'upsert_thread', payload: toThreadRow(updatedThread) });
            }
            return newMessage;
        },
        [attemptOperation]
    );

    const updateMessage = useCallback<ChatContextValue['updateMessage']>(
        (messageId, updates) => {
            let nextMessage: MessageWithThread | null = null;
            const timestamp = new Date();
            setMessages((prev) => {
                const current = prev[messageId];
                if (!current) {
                    console.warn(`[ChatProvider] Attempted to update missing message ${messageId}`);
                    return prev;
                }
                const applied = typeof updates === 'function' ? updates(current) : updates;
                nextMessage = {
                    ...current,
                    ...applied,
                    updatedAt: timestamp,
                };
                return {
                    ...prev,
                    [messageId]: nextMessage!,
                };
            });
            if (nextMessage) {
                attemptOperation({ type: 'upsert_message', payload: toMessageRow(nextMessage) });
            }
        },
        [attemptOperation]
    );

    const selectBranch = useCallback<ChatContextValue['selectBranch']>(
        (threadId, parentId, childId) => {
            if (!threadId) return;
            let updatedThread: ChatThread | null = null;
            const timestamp = new Date();
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

                    let nextLeaf: string | null | undefined = childId;
                    const visited = new Set<string>();
                    while (nextLeaf && !visited.has(nextLeaf)) {
                        visited.add(nextLeaf);
                        const message = messages[nextLeaf];
                        if (!message || message.children.length === 0) break;
                        const selectedChild = selectedChildByMessageId[nextLeaf] ?? message.children[message.children.length - 1];
                        selectedChildByMessageId[nextLeaf] = selectedChild;
                        nextLeaf = selectedChild;
                    }

                    updatedThread = {
                        ...thread,
                        selectedChildByMessageId,
                        selectedRootChild,
                        leafMessageId: nextLeaf || childId,
                        updatedAt: timestamp,
                    };
                    return updatedThread;
                })
            );
            if (updatedThread) {
                attemptOperation({ type: 'upsert_thread', payload: toThreadRow(updatedThread) });
            }
        },
        [attemptOperation, messages]
    );

    const updateThreadTitle = useCallback<ChatContextValue['updateThreadTitle']>((threadId, title) => {
        let updatedThread: ChatThread | null = null;
        const timestamp = new Date();
        setThreads((prev) =>
            prev.map((thread) => {
                if (thread.id !== threadId) return thread;
                updatedThread = {
                    ...thread,
                    title,
                    updatedAt: timestamp,
                };
                return updatedThread;
            })
        );
        if (updatedThread) {
            attemptOperation({ type: 'upsert_thread', payload: toThreadRow(updatedThread) });
        }
    }, [attemptOperation]);

    const updateDraft = useCallback<ChatContextValue['updateDraft']>((threadId, draftText) => {
        setDrafts((prev) => ({ ...prev, [threadId]: draftText }));
        attemptOperation({ type: 'upsert_draft', payload: toDraftRow(threadId, draftText) });
    }, [attemptOperation]);

    const clearDraft = useCallback<ChatContextValue['clearDraft']>((threadId) => {
        setDrafts((prev) => {
            const next = { ...prev };
            delete next[threadId];
            return next;
        });
        attemptOperation({ type: 'delete_draft', payload: { thread_id: threadId } });
    }, [attemptOperation]);

    const value: ChatContextValue = {
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
    };

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

