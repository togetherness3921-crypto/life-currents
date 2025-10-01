import { ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import {
    ChatContext,
    Message,
    ChatThread,
    MessageStore,
    ChatContextValue,
} from './chatProviderContext';

interface ThreadMetadata {
    leafMessageId: string | null;
    selectedChildByMessageId: Record<string, string>;
    rootChildren: string[];
    selectedRootChild?: string | null;
}

interface SupabaseThreadRow {
    id: string;
    title: string | null;
    metadata: ThreadMetadata | null;
    created_at: string | null;
    updated_at: string | null;
}

interface SupabaseMessageRow {
    id: string;
    thread_id: string;
    parent_id: string | null;
    role: string;
    content: string | null;
    thinking: string | null;
    tool_calls: any;
    created_at: string | null;
    updated_at: string | null;
}

interface SupabaseDraftRow {
    thread_id: string;
    draft_text: string | null;
    updated_at: string | null;
}

type PendingOperation =
    | { type: 'upsert_thread'; row: SupabaseThreadRow }
    | { type: 'upsert_message'; row: SupabaseMessageRow }
    | { type: 'upsert_draft'; row: SupabaseDraftRow };

const PENDING_OPS_KEY = 'chat_pending_ops_v1';

const emptyMetadata = (): ThreadMetadata => ({
    leafMessageId: null,
    selectedChildByMessageId: {},
    rootChildren: [],
    selectedRootChild: null,
});

const serializeThread = (thread: ChatThread): SupabaseThreadRow => ({
    id: thread.id,
    title: thread.title,
    metadata: {
        leafMessageId: thread.leafMessageId,
        selectedChildByMessageId: thread.selectedChildByMessageId || {},
        rootChildren: thread.rootChildren || [],
        selectedRootChild: thread.selectedRootChild ?? null,
    },
    created_at: thread.createdAt.toISOString(),
    updated_at: new Date().toISOString(),
});

const serializeMessage = (message: Message, threadId: string): SupabaseMessageRow => ({
    id: message.id,
    thread_id: threadId,
    parent_id: message.parentId,
    role: message.role,
    content: message.content,
    thinking: message.thinking ?? null,
    tool_calls: message.toolCalls && message.toolCalls.length > 0 ? message.toolCalls : null,
    created_at: message.createdAt ?? new Date().toISOString(),
    updated_at: message.updatedAt ?? new Date().toISOString(),
});

const serializeDraft = (threadId: string, draft: string): SupabaseDraftRow => ({
    thread_id: threadId,
    draft_text: draft,
    updated_at: new Date().toISOString(),
});

const LEGACY_THREADS_KEY = 'chat_threads';
const LEGACY_MESSAGES_KEY = 'chat_messages';

interface LegacyThread {
    id: string;
    title?: string;
    leafMessageId?: string | null;
    createdAt?: string | Date;
    selectedChildByMessageId?: Record<string, string>;
    rootChildren?: string[];
    selectedRootChild?: string | null;
}

interface LegacyMessage {
    id: string;
    parentId?: string | null;
    role?: Message['role'];
    content?: string;
    thinking?: string;
    children?: string[];
    toolCalls?: Message['toolCalls'];
    createdAt?: string;
    updatedAt?: string;
}

const normalizeLegacyThread = (thread: LegacyThread): ChatThread => {
    const rootChildren = Array.isArray(thread.rootChildren) ? thread.rootChildren : [];
    const selectedChildByMessageId = thread.selectedChildByMessageId ?? {};
    return {
        id: thread.id,
        title: thread.title ?? 'New Chat',
        leafMessageId: thread.leafMessageId ?? null,
        createdAt: thread.createdAt ? new Date(thread.createdAt) : new Date(),
        selectedChildByMessageId,
        rootChildren,
        selectedRootChild: thread.selectedRootChild ?? (rootChildren.length > 0 ? rootChildren[rootChildren.length - 1] : undefined),
    };
};

const normalizeLegacyMessage = (message: LegacyMessage): Message => ({
    id: message.id,
    parentId: message.parentId ?? null,
    role: message.role ?? 'assistant',
    content: message.content ?? '',
    thinking: message.thinking,
    children: Array.isArray(message.children) ? message.children : [],
    toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : [],
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
});

export const ChatProvider = ({ children }: { children: ReactNode }) => {
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [messages, setMessages] = useState<MessageStore>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [messageThreadMap, setMessageThreadMap] = useState<Record<string, string>>({});
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [pendingOps, setPendingOps] = useState<PendingOperation[]>(() => {
        try {
            const raw = localStorage.getItem(PENDING_OPS_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            console.error('[ChatProvider] Failed to parse pending operations', error);
        }
        return [];
    });

    const pendingOpsRef = useRef<PendingOperation[]>(pendingOps);
    const messagesRef = useRef<MessageStore>(messages);

    useEffect(() => {
        pendingOpsRef.current = pendingOps;
        try {
            localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(pendingOps));
        } catch (error) {
            console.error('[ChatProvider] Failed to persist pending operations', error);
        }
    }, [pendingOps]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const enqueuePendingOp = useCallback((op: PendingOperation) => {
        setPendingOps((prev) => [...prev, op]);
    }, []);

    const performOperation = useCallback(async (op: PendingOperation) => {
        switch (op.type) {
            case 'upsert_thread': {
                const { error } = await supabase
                    .from('chat_threads')
                    .upsert(op.row);
                if (error) throw error;
                break;
            }
            case 'upsert_message': {
                const { error } = await supabase
                    .from('chat_messages')
                    .upsert(op.row);
                if (error) throw error;
                break;
            }
            case 'upsert_draft': {
                const { error } = await supabase
                    .from('chat_drafts')
                    .upsert(op.row);
                if (error) throw error;
                break;
            }
            default:
                break;
        }
    }, []);

    const flushPendingOps = useCallback(async () => {
        if (pendingOpsRef.current.length === 0) return;
        const remaining: PendingOperation[] = [];
        for (const op of pendingOpsRef.current) {
            try {
                await performOperation(op);
            } catch (error) {
                console.error('[ChatProvider] Failed to flush pending operation', error);
                remaining.push(op);
            }
        }
        setPendingOps(remaining);
    }, [performOperation]);

    useEffect(() => {
        flushPendingOps();
        const handleOnline = () => {
            flushPendingOps();
        };
        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [flushPendingOps]);

    const migrateLegacyData = useCallback(async () => {
        try {
            const legacyThreadsRaw = localStorage.getItem(LEGACY_THREADS_KEY);
            const legacyMessagesRaw = localStorage.getItem(LEGACY_MESSAGES_KEY);
            if (!legacyThreadsRaw || !legacyMessagesRaw) return;

            let parsedLegacyThreads: LegacyThread[] = [];
            let parsedLegacyMessages: Record<string, LegacyMessage> = {};

            try {
                const threadsParsed = JSON.parse(legacyThreadsRaw);
                if (Array.isArray(threadsParsed)) {
                    parsedLegacyThreads = threadsParsed as LegacyThread[];
                }
                const messagesParsed = JSON.parse(legacyMessagesRaw);
                if (messagesParsed && typeof messagesParsed === 'object') {
                    parsedLegacyMessages = messagesParsed as Record<string, LegacyMessage>;
                }
            } catch (error) {
                console.error('[ChatProvider] Failed to parse legacy chat storage', error);
            }

            if (parsedLegacyThreads.length === 0) {
                localStorage.removeItem(LEGACY_THREADS_KEY);
                localStorage.removeItem(LEGACY_MESSAGES_KEY);
                return;
            }

            const normalizedThreads = parsedLegacyThreads
                .filter((thread) => Boolean(thread?.id))
                .map((thread) => normalizeLegacyThread(thread));

            const normalizedMessages: MessageStore = {};
            Object.entries(parsedLegacyMessages).forEach(([id, raw]) => {
                if (!raw || typeof raw !== 'object') return;
                const messageId = raw.id ?? id;
                normalizedMessages[messageId] = normalizeLegacyMessage({ ...raw, id: messageId });
            });

            const messageToThread: Record<string, string> = {};
            const assignMessagesToThread = (thread: ChatThread) => {
                const visit = (messageId: string) => {
                    if (!messageId || messageToThread[messageId]) return;
                    messageToThread[messageId] = thread.id;
                    const message = normalizedMessages[messageId];
                    if (!message) return;
                    message.children.forEach(visit);
                };
                thread.rootChildren.forEach(visit);
            };

            normalizedThreads.forEach(assignMessagesToThread);

            Object.values(normalizedMessages).forEach((message) => {
                if (messageToThread[message.id] || !message.parentId) return;
                const parentThread = messageToThread[message.parentId];
                if (parentThread) {
                    messageToThread[message.id] = parentThread;
                }
            });

            const threadRows = normalizedThreads.map(serializeThread);
            const messageRows = Object.values(normalizedMessages)
                .map((message) => {
                    const threadId = messageToThread[message.id];
                    if (!threadId) {
                        return null;
                    }
                    const createdAt = message.createdAt ?? new Date().toISOString();
                    const updatedAt = message.updatedAt ?? createdAt;
                    const messageWithTimestamps: Message = {
                        ...message,
                        createdAt,
                        updatedAt,
                    };
                    return serializeMessage(messageWithTimestamps, threadId);
                })
                .filter((row): row is SupabaseMessageRow => Boolean(row));

            for (const row of threadRows) {
                try {
                    await performOperation({ type: 'upsert_thread', row });
                } catch (error) {
                    console.error('[ChatProvider] Failed to persist legacy thread', error);
                    enqueuePendingOp({ type: 'upsert_thread', row });
                }
            }

            for (const row of messageRows) {
                try {
                    await performOperation({ type: 'upsert_message', row });
                } catch (error) {
                    console.error('[ChatProvider] Failed to persist legacy message', error);
                    enqueuePendingOp({ type: 'upsert_message', row });
                }
            }

            localStorage.removeItem(LEGACY_THREADS_KEY);
            localStorage.removeItem(LEGACY_MESSAGES_KEY);

            setThreads(normalizedThreads);
            setMessages(normalizedMessages);
            setMessageThreadMap(messageToThread);
            if (!activeThreadId && normalizedThreads.length > 0) {
                setActiveThreadId(normalizedThreads[normalizedThreads.length - 1].id);
            }
        } catch (error) {
            console.error('[ChatProvider] Failed to migrate legacy chats', error);
        }
    }, [performOperation, enqueuePendingOp, activeThreadId]);

    const refreshFromSupabase = useCallback(async () => {
        setLoading(true);
        try {
            await flushPendingOps();
            await migrateLegacyData();
            const [threadsResponse, messagesResponse, draftsResponse] = await Promise.all([
                supabase
                    .from('chat_threads')
                    .select('id, title, metadata, created_at, updated_at')
                    .order('created_at', { ascending: true }),
                supabase
                    .from('chat_messages')
                    .select('id, thread_id, parent_id, role, content, thinking, tool_calls, created_at, updated_at')
                    .order('created_at', { ascending: true }),
                supabase
                    .from('chat_drafts')
                    .select('thread_id, draft_text, updated_at'),
            ]);

            if (threadsResponse.error) throw threadsResponse.error;
            if (messagesResponse.error) throw messagesResponse.error;
            if (draftsResponse.error) throw draftsResponse.error;

            const normalizedThreads: ChatThread[] = (threadsResponse.data ?? []).map((row: SupabaseThreadRow) => {
                const metadata = (row.metadata as ThreadMetadata) ?? emptyMetadata();
                const rootChildren = Array.isArray(metadata.rootChildren) ? metadata.rootChildren : [];
                const selectedChildByMessageId = metadata.selectedChildByMessageId ?? {};
                return {
                    id: row.id,
                    title: row.title ?? 'New Chat',
                    leafMessageId: metadata.leafMessageId ?? null,
                    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
                    selectedChildByMessageId,
                    rootChildren,
                    selectedRootChild: metadata.selectedRootChild ?? undefined,
                };
            });

            const messageStore: MessageStore = {};
            const threadMap: Record<string, string> = {};

            (messagesResponse.data ?? []).forEach((row: SupabaseMessageRow) => {
                const toolCalls = Array.isArray(row.tool_calls)
                    ? row.tool_calls
                    : row.tool_calls
                        ? row.tool_calls
                        : [];
                messageStore[row.id] = {
                    id: row.id,
                    parentId: row.parent_id,
                    role: (row.role as Message['role']) ?? 'assistant',
                    content: row.content ?? '',
                    thinking: row.thinking ?? undefined,
                    children: [],
                    toolCalls,
                    createdAt: row.created_at ?? undefined,
                    updatedAt: row.updated_at ?? undefined,
                };
                threadMap[row.id] = row.thread_id;
            });

            Object.values(messageStore).forEach((message) => {
                if (message.parentId && messageStore[message.parentId]) {
                    messageStore[message.parentId] = {
                        ...messageStore[message.parentId],
                        children: [...messageStore[message.parentId].children, message.id],
                    };
                }
            });

            const draftMap: Record<string, string> = {};
            (draftsResponse.data ?? []).forEach((row: SupabaseDraftRow) => {
                draftMap[row.thread_id] = row.draft_text ?? '';
            });

            setThreads(normalizedThreads);
            setMessages(messageStore);
            setMessageThreadMap(threadMap);
            setDrafts(draftMap);
            setActiveThreadId((prev) => {
                if (prev && normalizedThreads.some((thread) => thread.id === prev)) {
                    return prev;
                }
                return normalizedThreads.length > 0 ? normalizedThreads[normalizedThreads.length - 1].id : null;
            });
        } catch (error) {
            console.error('[ChatProvider] Failed to refresh chat data', error);
        } finally {
            setLoading(false);
        }
    }, [flushPendingOps, migrateLegacyData]);

    useEffect(() => {
        refreshFromSupabase();
    }, [refreshFromSupabase]);

    const getThread = useCallback(
        (id: string) => threads.find((thread) => thread.id === id),
        [threads]
    );

    const getMessageChain = useCallback(
        (leafId: string | null): Message[] => {
            if (!leafId) return [];
            const chain: Message[] = [];
            let currentId: string | null = leafId;
            const store = messagesRef.current;
            while (currentId) {
                const message = store[currentId];
                if (!message) break;
                chain.unshift(message);
                currentId = message.parentId;
            }
            return chain;
        },
        []
    );

    const createThread = useCallback(() => {
        const id = uuidv4();
        const createdAt = new Date();
        const newThread: ChatThread = {
            id,
            title: 'New Chat',
            leafMessageId: null,
            createdAt,
            selectedChildByMessageId: {},
            rootChildren: [],
            selectedRootChild: undefined,
        };
        setThreads((prev) => [...prev, newThread]);
        setActiveThreadId(id);
        setDrafts((prev) => ({ ...prev, [id]: '' }));

        const row = serializeThread(newThread);
        void (async () => {
            try {
                await performOperation({ type: 'upsert_thread', row });
            } catch (error) {
                console.error('[ChatProvider] Failed to persist new thread', error);
                enqueuePendingOp({ type: 'upsert_thread', row });
            }
        })();

        return id;
    }, [performOperation, enqueuePendingOp]);

    const addMessage = useCallback(
        (threadId: string, messageData: Omit<Message, 'id' | 'children' | 'toolCalls'>): Message => {
            const newId = uuidv4();
            const timestamp = new Date().toISOString();
            const newMessage: Message = {
                ...messageData,
                id: newId,
                children: [],
                toolCalls: messageData.toolCalls ? [...messageData.toolCalls] : [],
                createdAt: timestamp,
                updatedAt: timestamp,
            };

            setMessages((prev) => {
                const updated: MessageStore = {
                    ...prev,
                    [newId]: newMessage,
                };
                if (messageData.parentId && prev[messageData.parentId]) {
                    updated[messageData.parentId] = {
                        ...prev[messageData.parentId],
                        children: [...prev[messageData.parentId].children, newId],
                    };
                }
                return updated;
            });
            setMessageThreadMap((prev) => ({ ...prev, [newId]: threadId }));

            let updatedThread: ChatThread | null = null;
            setThreads((prev) =>
                prev.map((thread) => {
                    if (thread.id !== threadId) return thread;

                    const selectedChildByMessageId = { ...thread.selectedChildByMessageId };
                    let rootChildren = thread.rootChildren ? [...thread.rootChildren] : [];
                    let selectedRootChild = thread.selectedRootChild;

                    if (messageData.parentId) {
                        selectedChildByMessageId[messageData.parentId] = newId;
                    } else {
                        rootChildren = [...rootChildren, newId];
                        selectedRootChild = newId;
                    }

                    const updatedThreadCandidate: ChatThread = {
                        ...thread,
                        title:
                            thread.title === 'New Chat' && messageData.role === 'user'
                                ? `${messageData.content.substring(0, 30)}...`
                                : thread.title,
                        leafMessageId: newId,
                        selectedChildByMessageId,
                        rootChildren,
                        selectedRootChild,
                    };
                    updatedThread = updatedThreadCandidate;
                    return updatedThreadCandidate;
                })
            );

            const messageRow = serializeMessage(newMessage, threadId);
            const threadRow = updatedThread ? serializeThread(updatedThread) : null;

            void (async () => {
                try {
                    await performOperation({ type: 'upsert_message', row: messageRow });
                } catch (error) {
                    console.error('[ChatProvider] Failed to persist message', error);
                    enqueuePendingOp({ type: 'upsert_message', row: messageRow });
                }
                if (threadRow) {
                    try {
                        await performOperation({ type: 'upsert_thread', row: threadRow });
                    } catch (error) {
                        console.error('[ChatProvider] Failed to update thread metadata after message', error);
                        enqueuePendingOp({ type: 'upsert_thread', row: threadRow });
                    }
                }
            })();

            return newMessage;
        },
        [performOperation, enqueuePendingOp]
    );

    const updateMessage = useCallback(
        (messageId: string, updates: Partial<Message> | ((message: Message) => Partial<Message>)) => {
            let updatedMessage: Message | null = null;
            setMessages((prev) => {
                const current = prev[messageId];
                if (!current) {
                    console.warn(`[ChatProvider] Attempted to update non-existent message: ${messageId}`);
                    return prev;
                }
                const appliedUpdates = typeof updates === 'function' ? updates(current) : updates;
                const merged: Message = {
                    ...current,
                    ...appliedUpdates,
                    updatedAt: new Date().toISOString(),
                };
                updatedMessage = merged;
                return {
                    ...prev,
                    [messageId]: merged,
                };
            });
            if (!updatedMessage) return;
            const threadId = messageThreadMap[messageId];
            if (!threadId) {
                console.warn('[ChatProvider] Could not determine thread for message', messageId);
                return;
            }
            const row = serializeMessage(updatedMessage, threadId);
            void (async () => {
                try {
                    await performOperation({ type: 'upsert_message', row });
                } catch (error) {
                    console.error('[ChatProvider] Failed to persist message update', error);
                    enqueuePendingOp({ type: 'upsert_message', row });
                }
            })();
        },
        [messageThreadMap, performOperation, enqueuePendingOp]
    );

    const selectBranch = useCallback(
        (threadId: string | null, parentId: string | null, childId: string) => {
            if (!threadId) return;
            let updatedThread: ChatThread | null = null;
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
                    const store = messagesRef.current;

                    while (nextLeaf && !visited.has(nextLeaf)) {
                        visited.add(nextLeaf);
                        const message = store[nextLeaf];
                        if (!message || message.children.length === 0) break;
                        const selectedChild =
                            selectedChildByMessageId[nextLeaf] ?? message.children[message.children.length - 1];
                        selectedChildByMessageId[nextLeaf] = selectedChild;
                        nextLeaf = selectedChild;
                    }

                    const nextThreadState: ChatThread = {
                        ...thread,
                        selectedChildByMessageId,
                        selectedRootChild,
                        leafMessageId: nextLeaf || childId,
                    };
                    updatedThread = nextThreadState;
                    return nextThreadState;
                })
            );

            if (updatedThread) {
                const row = serializeThread(updatedThread);
                void (async () => {
                    try {
                        await performOperation({ type: 'upsert_thread', row });
                    } catch (error) {
                        console.error('[ChatProvider] Failed to persist branch selection', error);
                        enqueuePendingOp({ type: 'upsert_thread', row });
                    }
                })();
            }
        },
        [performOperation, enqueuePendingOp]
    );

    const updateThreadTitle = useCallback(
        (threadId: string, title: string) => {
            let updatedThread: ChatThread | null = null;
            setThreads((prev) =>
                prev.map((thread) => {
                    if (thread.id !== threadId) return thread;
                    const nextThread = { ...thread, title };
                    updatedThread = nextThread;
                    return nextThread;
                })
            );
            if (updatedThread) {
                const row = serializeThread(updatedThread);
                void (async () => {
                    try {
                        await performOperation({ type: 'upsert_thread', row });
                    } catch (error) {
                        console.error('[ChatProvider] Failed to persist thread title', error);
                        enqueuePendingOp({ type: 'upsert_thread', row });
                    }
                })();
            }
        },
        [performOperation, enqueuePendingOp]
    );

    const getDraft = useCallback(
        (threadId: string) => drafts[threadId] ?? '',
        [drafts]
    );

    const updateDraft = useCallback(
        async (threadId: string, draft: string) => {
            setDrafts((prev) => ({ ...prev, [threadId]: draft }));
            const row = serializeDraft(threadId, draft);
            try {
                await performOperation({ type: 'upsert_draft', row });
            } catch (error) {
                console.error('[ChatProvider] Failed to persist draft', error);
                enqueuePendingOp({ type: 'upsert_draft', row });
            }
        },
        [performOperation, enqueuePendingOp]
    );

    const value: ChatContextValue = {
        threads,
        messages,
        drafts,
        activeThreadId,
        loading,
        setActiveThreadId,
        getThread,
        createThread,
        addMessage,
        getMessageChain,
        updateMessage,
        selectBranch,
        updateThreadTitle,
        getDraft,
        updateDraft,
        refreshFromSupabase,
    };

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
