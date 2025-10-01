import { ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    ChatContext,
    Message,
    ChatThread,
    MessageStore,
    ChatContextValue,
} from './chatProviderContext';
import { supabase } from '@/integrations/supabase/client';

type SerializableThread = Omit<ChatThread, 'createdAt'> & { createdAt: string };
type SerializableMessage = {
    id: string;
    threadId: string;
    parentId: string | null;
    role: Message['role'];
    content: string;
    thinking?: string;
    children: string[];
    toolCalls?: Message['toolCalls'];
};

type SupabaseThreadRow = {
    id: string;
    title: string | null;
    metadata: Record<string, any> | null;
    created_at: string | null;
};

type SupabaseMessageRow = {
    id: string;
    thread_id: string;
    parent_id: string | null;
    role: string;
    content: string | null;
    thinking: string | null;
    tool_calls: unknown;
    created_at: string | null;
};

type SupabaseDraftRow = {
    thread_id: string;
    draft_text: string | null;
};

const THREADS_STORAGE_KEY = 'chat_threads';
const MESSAGES_STORAGE_KEY = 'chat_messages';
const ACTIVE_THREAD_STORAGE_KEY = 'chat_active_thread';
const DRAFTS_STORAGE_KEY = 'chat_drafts';

const buildThreadMetadata = (thread: ChatThread) => ({
    leafMessageId: thread.leafMessageId,
    selectedChildByMessageId: thread.selectedChildByMessageId,
    rootChildren: thread.rootChildren,
    selectedRootChild: thread.selectedRootChild ?? null,
});

const serializeThreads = (threads: ChatThread[]): SerializableThread[] =>
    threads.map((thread) => ({
        ...thread,
        createdAt: thread.createdAt.toISOString(),
        selectedChildByMessageId: thread.selectedChildByMessageId || {},
        rootChildren: Array.isArray(thread.rootChildren) ? thread.rootChildren : [],
        selectedRootChild: thread.selectedRootChild ?? undefined,
    }));

const deserializeThreads = (serialized?: SerializableThread[] | null): ChatThread[] => {
    if (!serialized || serialized.length === 0) return [];
    return serialized.map((thread) => ({
        ...thread,
        createdAt: thread.createdAt ? new Date(thread.createdAt) : new Date(),
        selectedChildByMessageId: thread.selectedChildByMessageId || {},
        rootChildren: Array.isArray(thread.rootChildren) ? thread.rootChildren : [],
        selectedRootChild: thread.selectedRootChild ?? undefined,
        leafMessageId: thread.leafMessageId ?? null,
    }));
};

const serializeMessages = (messages: MessageStore): Record<string, SerializableMessage> => {
    const result: Record<string, SerializableMessage> = {};
    Object.entries(messages).forEach(([id, message]) => {
        result[id] = {
            id: message.id,
            threadId: message.threadId,
            parentId: message.parentId,
            role: message.role,
            content: message.content,
            thinking: message.thinking,
            children: [...message.children],
            toolCalls: message.toolCalls ? [...message.toolCalls] : undefined,
        };
    });
    return result;
};

const inferMessageThreads = (
    threads: ChatThread[],
    serializedMessages: Record<string, SerializableMessage>
): Record<string, string> => {
    const membership: Record<string, string> = {};

    threads.forEach((thread) => {
        const rootQueue = [...(thread.rootChildren || [])];
        const visited = new Set<string>();
        while (rootQueue.length > 0) {
            const currentId = rootQueue.shift();
            if (!currentId || visited.has(currentId)) continue;
            visited.add(currentId);
            membership[currentId] = thread.id;
            const childIds = serializedMessages[currentId]?.children || [];
            childIds.forEach((childId) => {
                if (childId) rootQueue.push(childId);
            });
        }
        if (thread.leafMessageId && !membership[thread.leafMessageId]) {
            membership[thread.leafMessageId] = thread.id;
        }
    });

    Object.entries(serializedMessages).forEach(([messageId, message]) => {
        if (membership[messageId]) return;
        let parentId = message.parentId;
        while (parentId) {
            if (membership[parentId]) {
                membership[messageId] = membership[parentId];
                break;
            }
            parentId = serializedMessages[parentId]?.parentId ?? null;
        }
    });

    return membership;
};

const deserializeMessages = (
    records?: Record<string, SerializableMessage> | null,
    threads: ChatThread[] = []
): MessageStore => {
    if (!records) return {};

    const membership = inferMessageThreads(threads, records);
    const store: MessageStore = {};

    Object.entries(records).forEach(([id, record]) => {
        const threadId = record.threadId || membership[id];
        if (!threadId) {
            return;
        }
        store[id] = {
            id,
            threadId,
            parentId: record.parentId ?? null,
            role: record.role,
            content: record.content,
            thinking: record.thinking,
            children: Array.isArray(record.children) ? [...record.children] : [],
            toolCalls: record.toolCalls ? [...record.toolCalls] : undefined,
        };
    });

    Object.values(store).forEach((message) => {
        if (message.parentId && store[message.parentId]) {
            const parent = store[message.parentId];
            if (!parent.children.includes(message.id)) {
                parent.children = [...parent.children, message.id];
            }
        }
    });

    return store;
};

const loadThreadsFromStorage = (): ChatThread[] => {
    try {
        const stored = localStorage.getItem(THREADS_STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored) as SerializableThread[];
        return deserializeThreads(parsed);
    } catch (error) {
        console.error('Failed to parse threads from localStorage', error);
        return [];
    }
};

const loadMessagesFromStorage = (threads: ChatThread[]): MessageStore => {
    try {
        const stored = localStorage.getItem(MESSAGES_STORAGE_KEY);
        if (!stored) return {};
        const parsed = JSON.parse(stored) as Record<string, SerializableMessage>;
        return deserializeMessages(parsed, threads);
    } catch (error) {
        console.error('Failed to parse messages from localStorage', error);
        return {};
    }
};

const loadDraftsFromStorage = (): Record<string, string> => {
    try {
        const stored = localStorage.getItem(DRAFTS_STORAGE_KEY);
        if (!stored) return {};
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
            return parsed as Record<string, string>;
        }
        return {};
    } catch (error) {
        console.error('Failed to parse drafts from localStorage', error);
        return {};
    }
};

const loadActiveThreadFromStorage = (): string | null => {
    try {
        const stored = localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY);
        return stored ?? null;
    } catch (error) {
        console.error('Failed to parse active thread from localStorage', error);
        return null;
    }
};

const deserializeThreadRow = (row: SupabaseThreadRow): ChatThread => {
    const metadata = (row.metadata ?? {}) as Record<string, any>;
    const selectedChildByMessageId =
        metadata && typeof metadata.selectedChildByMessageId === 'object'
            ? metadata.selectedChildByMessageId
            : {};
    const rootChildren = Array.isArray(metadata?.rootChildren) ? metadata.rootChildren : [];
    const selectedRootChild = metadata?.selectedRootChild ?? undefined;

    return {
        id: row.id,
        title: row.title ?? 'New Chat',
        createdAt: row.created_at ? new Date(row.created_at) : new Date(),
        leafMessageId: metadata?.leafMessageId ?? null,
        selectedChildByMessageId,
        rootChildren,
        selectedRootChild,
    };
};

const buildMessageStoreFromRows = (rows: SupabaseMessageRow[]): MessageStore => {
    const store: MessageStore = {};

    rows.forEach((row) => {
        if (!row.thread_id) return;
        const toolCallsValue = Array.isArray(row.tool_calls) ? row.tool_calls : undefined;
        store[row.id] = {
            id: row.id,
            threadId: row.thread_id,
            parentId: row.parent_id,
            role: (row.role as Message['role']) || 'assistant',
            content: row.content ?? '',
            thinking: row.thinking ?? undefined,
            children: [],
            toolCalls: toolCallsValue,
        };
    });

    Object.values(store).forEach((message) => {
        if (message.parentId && store[message.parentId]) {
            store[message.parentId].children = [
                ...store[message.parentId].children,
                message.id,
            ];
        }
    });

    return store;
};

const normalizeThreadWithMessages = (
    thread: ChatThread,
    messages: MessageStore,
    rows: SupabaseMessageRow[]
): ChatThread => {
    const sanitizedSelected: Record<string, string> = {};
    Object.entries(thread.selectedChildByMessageId || {}).forEach(([parentId, childId]) => {
        const parent = messages[parentId];
        if (parent && parent.children.includes(childId)) {
            sanitizedSelected[parentId] = childId;
        }
    });

    let rootChildren = Array.isArray(thread.rootChildren)
        ? thread.rootChildren.filter((id) => {
              const message = messages[id];
              return message && message.threadId === thread.id && message.parentId === null;
          })
        : [];

    if (rootChildren.length === 0) {
        rootChildren = rows
            .filter((row) => row.thread_id === thread.id && row.parent_id === null)
            .sort((a, b) => {
                const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                return aTime - bTime;
            })
            .map((row) => row.id);
    }

    let selectedRootChild = thread.selectedRootChild;
    if (selectedRootChild && !rootChildren.includes(selectedRootChild)) {
        selectedRootChild = rootChildren[rootChildren.length - 1] ?? undefined;
    }
    if (!selectedRootChild && rootChildren.length > 0) {
        selectedRootChild = rootChildren[rootChildren.length - 1];
    }

    let leafMessageId = thread.leafMessageId;
    if (leafMessageId && !messages[leafMessageId]) {
        leafMessageId = null;
    }

    if (!leafMessageId) {
        let candidate = selectedRootChild ?? null;
        const visited = new Set<string>();
        while (candidate && !visited.has(candidate)) {
            visited.add(candidate);
            const message = messages[candidate];
            if (!message || message.children.length === 0) break;
            const preferred = sanitizedSelected[candidate] ?? message.children[message.children.length - 1];
            sanitizedSelected[candidate] = preferred;
            candidate = preferred;
        }

        if (!candidate) {
            const sortedByCreated = rows
                .filter((row) => row.thread_id === thread.id)
                .sort((a, b) => {
                    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
                    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
                    return aTime - bTime;
                });
            candidate = sortedByCreated.length > 0 ? sortedByCreated[sortedByCreated.length - 1].id : null;
        }

        leafMessageId = candidate;
    }

    if (!leafMessageId && rootChildren.length > 0) {
        leafMessageId = rootChildren[rootChildren.length - 1] ?? null;
    }

    return {
        ...thread,
        rootChildren,
        selectedRootChild,
        leafMessageId: leafMessageId ?? null,
        selectedChildByMessageId: sanitizedSelected,
    };
};

const buildDraftMap = (rows: SupabaseDraftRow[]): Record<string, string> => {
    const drafts: Record<string, string> = {};
    rows.forEach((row) => {
        if (!row.thread_id) return;
        drafts[row.thread_id] = row.draft_text ?? '';
    });
    return drafts;
};

const migrateLocalDataToSupabase = async (
    localThreads: ChatThread[],
    localMessages: MessageStore,
    localDrafts: Record<string, string>
) => {
    if (
        localThreads.length === 0 &&
        Object.keys(localMessages).length === 0 &&
        Object.keys(localDrafts).length === 0
    ) {
        return;
    }

    const threadPayload = localThreads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        metadata: buildThreadMetadata(thread),
    }));

    if (threadPayload.length > 0) {
        const { error } = await (supabase as any)
            .from('chat_threads')
            .upsert(threadPayload);
        if (error) throw error;
    }

    const messagePayload = Object.values(localMessages)
        .filter((message) => message.threadId)
        .map((message) => ({
            id: message.id,
            thread_id: message.threadId,
            parent_id: message.parentId,
            role: message.role,
            content: message.content,
            thinking: message.thinking ?? null,
            tool_calls: message.toolCalls ?? null,
        }));

    if (messagePayload.length > 0) {
        const { error } = await (supabase as any)
            .from('chat_messages')
            .upsert(messagePayload);
        if (error) throw error;
    }

    const draftPayload = Object.entries(localDrafts).map(([threadId, draft_text]) => ({
        thread_id: threadId,
        draft_text,
    }));

    if (draftPayload.length > 0) {
        const { error } = await (supabase as any)
            .from('chat_drafts')
            .upsert(draftPayload);
        if (error) throw error;
    }
};

export const ChatProvider = ({ children }: { children: ReactNode }) => {
    const initialThreads = loadThreadsFromStorage();
    const initialMessages = loadMessagesFromStorage(initialThreads);
    const initialDrafts = loadDraftsFromStorage();
    const initialActiveThread = loadActiveThreadFromStorage();

    const [threads, setThreads] = useState<ChatThread[]>(initialThreads);
    const [messages, setMessages] = useState<MessageStore>(initialMessages);
    const [drafts, setDrafts] = useState<Record<string, string>>(initialDrafts);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(initialActiveThread);

    const localSnapshotRef = useRef({
        threads: initialThreads,
        messages: initialMessages,
        drafts: initialDrafts,
        activeThreadId: initialActiveThread,
    });

    useEffect(() => {
        let isMounted = true;

        const loadRemoteData = async () => {
            try {
                const { data: threadRows, error: threadError } = await (supabase as any)
                    .from('chat_threads')
                    .select('id, title, metadata, created_at')
                    .order('created_at', { ascending: true });
                if (threadError) throw threadError;

                let effectiveThreadRows = threadRows ?? [];

                if (effectiveThreadRows.length === 0 && localSnapshotRef.current.threads.length > 0) {
                    try {
                        await migrateLocalDataToSupabase(
                            localSnapshotRef.current.threads,
                            localSnapshotRef.current.messages,
                            localSnapshotRef.current.drafts
                        );
                        const { data: migratedThreads, error: migratedError } = await (supabase as any)
                            .from('chat_threads')
                            .select('id, title, metadata, created_at')
                            .order('created_at', { ascending: true });
                        if (migratedError) throw migratedError;
                        effectiveThreadRows = migratedThreads ?? [];
                    } catch (migrationError) {
                        console.error('Failed to migrate local chats to Supabase', migrationError);
                    }
                }

                const { data: messageRows, error: messageError } = await (supabase as any)
                    .from('chat_messages')
                    .select('id, thread_id, parent_id, role, content, thinking, tool_calls, created_at');
                if (messageError) throw messageError;

                const { data: draftRows, error: draftError } = await (supabase as any)
                    .from('chat_drafts')
                    .select('thread_id, draft_text');
                if (draftError) throw draftError;

                if (!isMounted) return;

                const threadObjects = (effectiveThreadRows ?? []).map(deserializeThreadRow);
                const messageStore = buildMessageStoreFromRows(messageRows ?? []);
                const normalizedThreads = threadObjects.map((thread) =>
                    normalizeThreadWithMessages(thread, messageStore, messageRows ?? [])
                );
                const draftMap = buildDraftMap(draftRows ?? []);

                setThreads(normalizedThreads);
                setMessages(messageStore);
                setDrafts(draftMap);

                const preservedActive = localSnapshotRef.current.activeThreadId;
                const nextActive = preservedActive && normalizedThreads.some((thread) => thread.id === preservedActive)
                    ? preservedActive
                    : normalizedThreads[0]?.id ?? null;
                setActiveThreadId((prev) => (prev === nextActive ? prev : nextActive));

                localSnapshotRef.current = {
                    threads: normalizedThreads,
                    messages: messageStore,
                    drafts: draftMap,
                    activeThreadId: nextActive,
                };
            } catch (error) {
                console.error('Failed to load chat data from Supabase', error);
            }
        };

        loadRemoteData();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(serializeThreads(threads)));
        } catch (error) {
            console.error('Failed to save threads to localStorage', error);
        }
    }, [threads]);

    useEffect(() => {
        try {
            localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(serializeMessages(messages)));
        } catch (error) {
            console.error('Failed to save messages to localStorage', error);
        }
    }, [messages]);

    useEffect(() => {
        try {
            localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
        } catch (error) {
            console.error('Failed to save drafts to localStorage', error);
        }
    }, [drafts]);

    useEffect(() => {
        try {
            if (activeThreadId) {
                localStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, activeThreadId);
            } else {
                localStorage.removeItem(ACTIVE_THREAD_STORAGE_KEY);
            }
        } catch (error) {
            console.error('Failed to persist active thread to localStorage', error);
        }
    }, [activeThreadId]);

    const persistThreadRow = useCallback(async (thread: ChatThread) => {
        try {
            const { error } = await (supabase as any)
                .from('chat_threads')
                .update({
                    title: thread.title,
                    metadata: buildThreadMetadata(thread),
                })
                .eq('id', thread.id);
            if (error) throw error;
        } catch (error) {
            console.error('Failed to persist thread metadata to Supabase', error);
        }
    }, []);

    const getThread = useCallback((id: string) => threads.find((thread) => thread.id === id), [threads]);

    const getMessageChain = useCallback(
        (leafId: string | null): Message[] => {
            if (!leafId) return [];
            const chain: Message[] = [];
            let current: string | null = leafId;
            const visited = new Set<string>();
            while (current && !visited.has(current)) {
                visited.add(current);
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
        const newThread: ChatThread = {
            id: uuidv4(),
            title: 'New Chat',
            leafMessageId: null,
            createdAt: new Date(),
            selectedChildByMessageId: {},
            rootChildren: [],
            selectedRootChild: undefined,
        };

        setThreads((prev) => [...prev, newThread]);
        setActiveThreadId(newThread.id);

        (async () => {
            try {
                const { error } = await (supabase as any)
                    .from('chat_threads')
                    .insert({
                        id: newThread.id,
                        title: newThread.title,
                        metadata: buildThreadMetadata(newThread),
                    });
                if (error) throw error;
            } catch (error) {
                console.error('Failed to create thread in Supabase', error);
            }
        })();

        return newThread.id;
    }, []);

    const addMessage = useCallback(
        (
            threadId: string,
            messageData: Omit<Message, 'id' | 'children' | 'threadId'>
        ): Message => {
            const newId = uuidv4();
            const toolCalls = messageData.toolCalls ? [...messageData.toolCalls] : undefined;
            const newMessage: Message = {
                ...messageData,
                id: newId,
                threadId,
                children: [],
                toolCalls,
            };

            setMessages((prev) => {
                const nextMessages: MessageStore = {
                    ...prev,
                    [newId]: newMessage,
                };
                if (messageData.parentId && prev[messageData.parentId]) {
                    nextMessages[messageData.parentId] = {
                        ...prev[messageData.parentId],
                        children: [...prev[messageData.parentId].children, newId],
                    };
                }
                return nextMessages;
            });

            let updatedThreadForPersist: ChatThread | null = null;
            setThreads((prev) =>
                prev.map((thread) => {
                    if (thread.id !== threadId) return thread;

                    const selectedChildByMessageId = { ...thread.selectedChildByMessageId };
                    let rootChildren = Array.isArray(thread.rootChildren) ? [...thread.rootChildren] : [];
                    let selectedRootChild = thread.selectedRootChild;

                    if (messageData.parentId) {
                        selectedChildByMessageId[messageData.parentId] = newId;
                    } else {
                        rootChildren = [...rootChildren, newId];
                        selectedRootChild = newId;
                    }

                    const updatedThread: ChatThread = {
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
                    updatedThreadForPersist = updatedThread;
                    return updatedThread;
                })
            );

            (async () => {
                try {
                    const { error } = await (supabase as any)
                        .from('chat_messages')
                        .insert({
                            id: newId,
                            thread_id: threadId,
                            parent_id: messageData.parentId,
                            role: newMessage.role,
                            content: newMessage.content,
                            thinking: newMessage.thinking ?? null,
                            tool_calls: newMessage.toolCalls ?? null,
                        });
                    if (error) throw error;
                } catch (error) {
                    console.error('Failed to add message in Supabase', error);
                }
            })();

            if (updatedThreadForPersist) {
                persistThreadRow(updatedThreadForPersist);
            }

            return newMessage;
        },
        [persistThreadRow]
    );

    const updateMessage = useCallback(
        (
            messageId: string,
            updates: Partial<Message> | ((message: Message) => Partial<Message>)
        ) => {
            let updatedMessage: Message | null = null;
            setMessages((prev) => {
                const current = prev[messageId];
                if (!current) {
                    console.warn(`[ChatProvider] Attempted to update non-existent message: ${messageId}`);
                    return prev;
                }
                const appliedUpdates =
                    typeof updates === 'function' ? updates(current) : updates;
                const nextMessage = {
                    ...current,
                    ...appliedUpdates,
                } as Message;
                updatedMessage = nextMessage;
                return {
                    ...prev,
                    [messageId]: nextMessage,
                };
            });

            if (updatedMessage) {
                (async () => {
                    try {
                        const { error } = await (supabase as any)
                            .from('chat_messages')
                            .update({
                                content: updatedMessage!.content,
                                thinking: updatedMessage!.thinking ?? null,
                                tool_calls: updatedMessage!.toolCalls ?? null,
                                role: updatedMessage!.role,
                                parent_id: updatedMessage!.parentId,
                            })
                            .eq('id', messageId);
                        if (error) throw error;
                    } catch (error) {
                        console.error('Failed to update message in Supabase', error);
                    }
                })();
            }
        },
        []
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

                    let nextLeaf: string | null = childId;
                    const visited = new Set<string>();

                    while (nextLeaf && !visited.has(nextLeaf)) {
                        visited.add(nextLeaf);
                        const message = messages[nextLeaf];
                        if (!message || message.children.length === 0) break;
                        const preferredChild =
                            selectedChildByMessageId[nextLeaf] ??
                            message.children[message.children.length - 1];
                        selectedChildByMessageId[nextLeaf] = preferredChild;
                        nextLeaf = preferredChild;
                    }

                    updatedThread = {
                        ...thread,
                        selectedChildByMessageId,
                        selectedRootChild,
                        leafMessageId: nextLeaf || childId,
                    };
                    return updatedThread;
                })
            );

            if (updatedThread) {
                persistThreadRow(updatedThread);
            }
        },
        [messages, persistThreadRow]
    );

    const updateThreadTitle = useCallback(
        (threadId: string, title: string) => {
            let updatedThread: ChatThread | null = null;
            setThreads((prev) =>
                prev.map((thread) => {
                    if (thread.id !== threadId) return thread;
                    updatedThread = { ...thread, title };
                    return updatedThread;
                })
            );

            if (updatedThread) {
                persistThreadRow(updatedThread);
            }
        },
        [persistThreadRow]
    );

    const updateDraft = useCallback((threadId: string, value: string) => {
        setDrafts((prev) => {
            if (prev[threadId] === value) return prev;
            return { ...prev, [threadId]: value };
        });

        (async () => {
            try {
                const { error } = await (supabase as any)
                    .from('chat_drafts')
                    .upsert({ thread_id: threadId, draft_text: value });
                if (error) throw error;
            } catch (error) {
                console.error('Failed to persist draft to Supabase', error);
            }
        })();
    }, []);

    const clearDraft = useCallback((threadId: string) => {
        setDrafts((prev) => {
            if (!(threadId in prev)) return prev;
            const next = { ...prev };
            delete next[threadId];
            return next;
        });

        (async () => {
            try {
                const { error } = await (supabase as any)
                    .from('chat_drafts')
                    .delete()
                    .eq('thread_id', threadId);
                if (error) throw error;
            } catch (error) {
                console.error('Failed to clear draft in Supabase', error);
            }
        })();
    }, []);

    const value: ChatContextValue = {
        threads,
        messages,
        activeThreadId,
        drafts,
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
