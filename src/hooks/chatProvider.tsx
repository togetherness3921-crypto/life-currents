import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import {
    ChatContext,
    ChatContextValue,
    ChatThread,
    Message,
    MessageStore,
} from './chatProviderContext';

type ChatThreadRow = Database['public']['Tables']['chat_threads']['Row'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
type ChatDraftRow = Database['public']['Tables']['chat_drafts']['Row'];

type ThreadMetadata = {
    rootChildren?: string[];
    selectedRootChild?: string | null;
    selectedChildByMessageId?: Record<string, string>;
    leafMessageId?: string | null;
};

const THREADS_STORAGE_KEY = 'chat_threads';
const MESSAGES_STORAGE_KEY = 'chat_messages';
const DRAFTS_STORAGE_KEY = 'chat_drafts';
const ACTIVE_THREAD_STORAGE_KEY = 'chat_active_thread';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const safeParseJSON = <T,>(value: string | null): T | null => {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch (error) {
        console.warn('[ChatProvider] Failed to parse JSON from localStorage', error);
        return null;
    }
};

const rehydrateThreads = (threads: ChatThread[]): ChatThread[] =>
    threads.map((thread) => {
        const rootChildren = Array.isArray(thread.rootChildren) ? [...thread.rootChildren] : [];
        const selectedChildByMessageId =
            thread.selectedChildByMessageId && typeof thread.selectedChildByMessageId === 'object'
                ? { ...thread.selectedChildByMessageId }
                : {};
        const selectedRootChild =
            typeof thread.selectedRootChild === 'string' && rootChildren.includes(thread.selectedRootChild)
                ? thread.selectedRootChild
                : rootChildren[rootChildren.length - 1];

        return {
            ...thread,
            createdAt: thread.createdAt ? new Date(thread.createdAt) : new Date(),
            rootChildren,
            selectedChildByMessageId,
            selectedRootChild,
            leafMessageId: thread.leafMessageId ?? null,
        };
    });

const rehydrateMessages = (raw: MessageStore): MessageStore => {
    const result: MessageStore = {};
    Object.entries(raw || {}).forEach(([id, value]) => {
        if (!value) return;
        result[id] = {
            ...value,
            threadId: value.threadId ?? '',
            children: Array.isArray(value.children) ? [...value.children] : [],
            toolCalls: Array.isArray(value.toolCalls) ? [...value.toolCalls] : [],
        };
    });
    return result;
};

const assignThreadIds = (threads: ChatThread[], messages: MessageStore): MessageStore => {
    const assigned: MessageStore = {};
    const visited = new Set<string>();

    const visit = (threadId: string, messageId: string) => {
        if (visited.has(messageId)) return;
        const message = messages[messageId];
        if (!message) return;
        visited.add(messageId);
        assigned[messageId] = {
            ...message,
            threadId,
            children: [...message.children],
            toolCalls: Array.isArray(message.toolCalls) ? [...message.toolCalls] : [],
        };
        message.children.forEach((childId) => visit(threadId, childId));
    };

    threads.forEach((thread) => {
        thread.rootChildren.forEach((rootId) => visit(thread.id, rootId));
    });

    Object.entries(messages).forEach(([id, message]) => {
        if (assigned[id]) return;
        assigned[id] = {
            ...message,
            threadId: message.threadId || '',
            children: [...message.children],
            toolCalls: Array.isArray(message.toolCalls) ? [...message.toolCalls] : [],
        };
    });

    return assigned;
};

const normalizeToolCalls = (value: unknown): Message['toolCalls'] => {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value as Message['toolCalls'];
    }
    return [];
};

const resolveLeafId = (
    thread: Pick<ChatThread, 'rootChildren' | 'selectedRootChild' | 'selectedChildByMessageId'>,
    messages: MessageStore
): string | null => {
    const visited = new Set<string>();
    let current: string | null =
        thread.selectedRootChild ?? thread.rootChildren[thread.rootChildren.length - 1] ?? null;

    while (current) {
        if (visited.has(current)) break;
        visited.add(current);
        const message = messages[current];
        if (!message) break;
        if (message.children.length === 0) break;
        const preferred = thread.selectedChildByMessageId[current];
        const next =
            preferred && message.children.includes(preferred)
                ? preferred
                : message.children[message.children.length - 1];
        if (!next) break;
        current = next;
    }

    return current;
};

const threadMetadataFromThread = (thread: ChatThread): ThreadMetadata => {
    const metadata: ThreadMetadata = {
        rootChildren: [...thread.rootChildren],
        selectedRootChild: thread.selectedRootChild ?? null,
        selectedChildByMessageId: { ...thread.selectedChildByMessageId },
        leafMessageId: thread.leafMessageId ?? null,
    };
    Object.entries(metadata.selectedChildByMessageId!).forEach(([parentId, childId]) => {
        if (typeof childId !== 'string' || !childId) {
            delete metadata.selectedChildByMessageId![parentId];
        }
    });
    return metadata;
};

const buildStateFromRemote = (
    threadRows: ChatThreadRow[] | null,
    messageRows: ChatMessageRow[] | null,
    draftRows: ChatDraftRow[] | null
) => {
    const sortedMessages = [...(messageRows ?? [])].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return aTime - bTime;
    });

    const messages: MessageStore = {};
    const childrenByParent = new Map<string, string[]>();
    const rootChildrenByThread = new Map<string, string[]>();

    sortedMessages.forEach((row) => {
        messages[row.id] = {
            id: row.id,
            threadId: row.thread_id,
            parentId: row.parent_id,
            role: row.role as Message['role'],
            content: row.content ?? '',
            thinking: row.thinking ?? undefined,
            children: [],
            toolCalls: normalizeToolCalls(row.tool_calls),
        };

        if (row.parent_id) {
            const list = childrenByParent.get(row.parent_id) ?? [];
            list.push(row.id);
            childrenByParent.set(row.parent_id, list);
        } else {
            const list = rootChildrenByThread.get(row.thread_id) ?? [];
            list.push(row.id);
            rootChildrenByThread.set(row.thread_id, list);
        }
    });

    childrenByParent.forEach((childIds, parentId) => {
        if (messages[parentId]) {
            messages[parentId].children = [...childIds];
        }
    });

    const threads: ChatThread[] = (threadRows ?? []).map((row) => {
        const metadata = (row.metadata as ThreadMetadata | null) ?? {};
        const fallbackRoots = rootChildrenByThread.get(row.id) ?? [];
        const metadataRoots = Array.isArray(metadata.rootChildren)
            ? metadata.rootChildren.filter((id): id is string => typeof id === 'string' && !!messages[id])
            : [];

        const rootChildren: string[] = [];
        metadataRoots.forEach((id) => {
            if (messages[id] && !rootChildren.includes(id)) {
                rootChildren.push(id);
            }
        });
        fallbackRoots.forEach((id) => {
            if (messages[id] && !rootChildren.includes(id)) {
                rootChildren.push(id);
            }
        });

        const selection: Record<string, string> = {};
        if (metadata.selectedChildByMessageId && typeof metadata.selectedChildByMessageId === 'object') {
            Object.entries(metadata.selectedChildByMessageId).forEach(([parentId, childId]) => {
                if (
                    typeof childId === 'string' &&
                    childId &&
                    messages[parentId]?.children.includes(childId)
                ) {
                    selection[parentId] = childId;
                }
            });
        }

        let selectedRootChild: string | undefined;
        if (
            metadata.selectedRootChild &&
            typeof metadata.selectedRootChild === 'string' &&
            rootChildren.includes(metadata.selectedRootChild)
        ) {
            selectedRootChild = metadata.selectedRootChild;
        } else if (rootChildren.length > 0) {
            selectedRootChild = rootChildren[rootChildren.length - 1];
        }

        const thread: ChatThread = {
            id: row.id,
            title: row.title ?? 'Untitled',
            createdAt: row.created_at ? new Date(row.created_at) : new Date(),
            leafMessageId: null,
            selectedChildByMessageId: selection,
            rootChildren,
            selectedRootChild,
        };

        const metadataLeaf = metadata.leafMessageId;
        if (metadataLeaf && typeof metadataLeaf === 'string' && messages[metadataLeaf]) {
            thread.leafMessageId = metadataLeaf;
        } else {
            thread.leafMessageId = resolveLeafId(thread, messages);
        }

        return thread;
    });

    const messagesWithThreads = assignThreadIds(threads, messages);

    const drafts: Record<string, string> = {};
    (draftRows ?? []).forEach((row) => {
        if (row.draft_text) {
            drafts[row.thread_id] = row.draft_text;
        }
    });

    return { threads, messages: messagesWithThreads, drafts };
};

const messageToRow = (message: Message): Database['public']['Tables']['chat_messages']['Insert'] => ({
    id: message.id,
    thread_id: message.threadId,
    parent_id: message.parentId,
    role: message.role,
    content: message.content,
    thinking: message.thinking ?? null,
    tool_calls: message.toolCalls && message.toolCalls.length > 0 ? message.toolCalls : message.toolCalls ? [] : null,
});

const ChatProvider = ({ children }: { children: ReactNode }) => {
    const storedThreads = rehydrateThreads(
        safeParseJSON<ChatThread[]>(isBrowser ? window.localStorage.getItem(THREADS_STORAGE_KEY) : null) || []
    );
    const storedMessages = rehydrateMessages(
        safeParseJSON<MessageStore>(isBrowser ? window.localStorage.getItem(MESSAGES_STORAGE_KEY) : null) || {}
    );
    const storedDrafts =
        safeParseJSON<Record<string, string>>(isBrowser ? window.localStorage.getItem(DRAFTS_STORAGE_KEY) : null) || {};
    const storedActiveThread = (() => {
        if (!isBrowser) return null;
        const raw = window.localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY);
        if (!raw || raw === 'null') return null;
        return raw;
    })();

    const initialMessages = assignThreadIds(storedThreads, storedMessages);

    const [threads, setThreads] = useState<ChatThread[]>(storedThreads);
    const [messages, setMessages] = useState<MessageStore>(initialMessages);
    const [drafts, setDrafts] = useState<Record<string, string>>(storedDrafts);
    const [activeThreadId, setActiveThreadIdState] = useState<string | null>(storedActiveThread);

    const pendingTasksRef = useRef<Array<() => Promise<void>>>([]);
    const processingTasksRef = useRef(false);
    const retryTimerRef = useRef<number | null>(null);

    const clearRetryTimer = useCallback(() => {
        if (!isBrowser) return;
        if (retryTimerRef.current) {
            window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
        }
    }, []);

    const flushPending = useCallback(async () => {
        if (processingTasksRef.current) return;
        if (pendingTasksRef.current.length === 0) return;
        processingTasksRef.current = true;
        clearRetryTimer();
        try {
            while (pendingTasksRef.current.length > 0) {
                const task = pendingTasksRef.current.shift();
                if (!task) break;
                try {
                    await task();
                } catch (error) {
                    console.error('[ChatProvider] Pending Supabase task failed, retrying later', error);
                    pendingTasksRef.current.unshift(task);
                    if (isBrowser) {
                        retryTimerRef.current = window.setTimeout(() => {
                            flushPending();
                        }, 2000);
                    }
                    return;
                }
            }
        } finally {
            processingTasksRef.current = false;
        }
    }, [clearRetryTimer]);

    const scheduleTask = useCallback(
        async (task: () => Promise<void>) => {
            try {
                await task();
            } catch (error) {
                console.error('[ChatProvider] Supabase operation failed, queuing for retry', error);
                pendingTasksRef.current.push(task);
                if (isBrowser) {
                    clearRetryTimer();
                    retryTimerRef.current = window.setTimeout(() => {
                        flushPending();
                    }, 2000);
                }
            }
        },
        [clearRetryTimer, flushPending]
    );

    useEffect(() => {
        if (!isBrowser) return;
        const handleOnline = () => {
            flushPending();
        };
        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, [flushPending]);

    useEffect(() => () => {
        clearRetryTimer();
    }, [clearRetryTimer]);

    useEffect(() => {
        let isMounted = true;
        const loadRemote = async () => {
            try {
                const [threadsRes, messagesRes, draftsRes] = await Promise.all([
                    supabase.from('chat_threads').select('id, title, metadata, created_at'),
                    supabase
                        .from('chat_messages')
                        .select('id, thread_id, parent_id, role, content, thinking, tool_calls, created_at'),
                    supabase.from('chat_drafts').select('thread_id, draft_text'),
                ]);

                if (!isMounted) return;

                if (threadsRes.error) throw threadsRes.error;
                if (messagesRes.error) throw messagesRes.error;
                if (draftsRes.error) throw draftsRes.error;

                const remoteState = buildStateFromRemote(
                    threadsRes.data ?? [],
                    messagesRes.data ?? [],
                    draftsRes.data ?? []
                );

                setThreads(remoteState.threads);
                setMessages(remoteState.messages);
                setDrafts(remoteState.drafts);

                if (remoteState.threads.length > 0) {
                    setActiveThreadIdState((current) => {
                        if (current && remoteState.threads.some((thread) => thread.id === current)) {
                            return current;
                        }
                        return remoteState.threads[0]?.id ?? null;
                    });
                }
            } catch (error) {
                console.error('[ChatProvider] Failed to load chat data from Supabase', error);
            } finally {
                if (isMounted) {
                    // Remote load attempt complete; process any queued tasks.
                    flushPending();
                }
            }
        };

        loadRemote();
        return () => {
            isMounted = false;
        };
    }, [flushPending]);

    useEffect(() => {
        if (!isBrowser) return;
        try {
            window.localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads));
        } catch (error) {
            console.error('[ChatProvider] Failed to save threads to localStorage', error);
        }
    }, [threads]);

    useEffect(() => {
        if (!isBrowser) return;
        try {
            window.localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(messages));
        } catch (error) {
            console.error('[ChatProvider] Failed to save messages to localStorage', error);
        }
    }, [messages]);

    useEffect(() => {
        if (!isBrowser) return;
        try {
            window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
        } catch (error) {
            console.error('[ChatProvider] Failed to save drafts to localStorage', error);
        }
    }, [drafts]);

    useEffect(() => {
        if (!isBrowser) return;
        try {
            if (activeThreadId) {
                window.localStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, activeThreadId);
            } else {
                window.localStorage.removeItem(ACTIVE_THREAD_STORAGE_KEY);
            }
        } catch (error) {
            console.error('[ChatProvider] Failed to save activeThreadId to localStorage', error);
        }
    }, [activeThreadId]);

    const setActiveThreadId = useCallback((id: string | null) => {
        setActiveThreadIdState(id);
    }, []);

    const getThread = useCallback((id: string) => threads.find((t) => t.id === id), [threads]);

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

    const persistThread = useCallback(
        (thread: ChatThread) =>
            scheduleTask(async () => {
                const { error } = await supabase.from('chat_threads').upsert({
                    id: thread.id,
                    title: thread.title,
                    metadata: threadMetadataFromThread(thread),
                });
                if (error) throw error;
            }),
        [scheduleTask]
    );

    const persistMessage = useCallback(
        (message: Message) =>
            scheduleTask(async () => {
                const { error } = await supabase.from('chat_messages').upsert(messageToRow(message));
                if (error) throw error;
            }),
        [scheduleTask]
    );

    const persistDraft = useCallback(
        (threadId: string, content: string) =>
            scheduleTask(async () => {
                const { error } = await supabase.from('chat_drafts').upsert({
                    thread_id: threadId,
                    draft_text: content,
                });
                if (error) throw error;
            }),
        [scheduleTask]
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
        setActiveThreadIdState(newThread.id);
        setDrafts((prev) => ({ ...prev, [newThread.id]: '' }));
        persistThread(newThread);
        persistDraft(newThread.id, '');
        return newThread.id;
    }, [persistDraft, persistThread]);

    const addMessage = useCallback(
        (
            threadId: string,
            messageData: Omit<Message, 'id' | 'children' | 'threadId'>
        ): Message => {
            const newId = uuidv4();
            const newMessage: Message = {
                ...messageData,
                id: newId,
                threadId,
                children: [],
                toolCalls: messageData.toolCalls ? [...messageData.toolCalls] : [],
            };

            setMessages((prev) => {
                const updated = {
                    ...prev,
                    [newId]: newMessage,
                };
                if (newMessage.parentId && prev[newMessage.parentId]) {
                    updated[newMessage.parentId] = {
                        ...prev[newMessage.parentId],
                        children: [...prev[newMessage.parentId].children, newId],
                    };
                }
                return updated;
            });

            let threadForPersist: ChatThread | null = null;
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

                    const nextThread: ChatThread = {
                        ...thread,
                        title:
                            thread.title === 'New Chat' && newMessage.role === 'user'
                                ? `${newMessage.content.substring(0, 30)}...`
                                : thread.title,
                        leafMessageId: newId,
                        selectedChildByMessageId,
                        rootChildren,
                        selectedRootChild,
                    };
                    threadForPersist = nextThread;
                    return nextThread;
                })
            );

            if (threadForPersist) {
                persistThread(threadForPersist);
            }
            persistMessage(newMessage);
            return newMessage;
        },
        [persistMessage, persistThread]
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
                updatedMessage = {
                    ...current,
                    ...appliedUpdates,
                };
                return {
                    ...prev,
                    [messageId]: updatedMessage!,
                };
            });

            if (updatedMessage) {
                persistMessage(updatedMessage);
            }
        },
        [persistMessage]
    );

    const selectBranch = useCallback(
        (threadId: string | null, parentId: string | null, childId: string) => {
            if (!threadId) return;
            let threadForPersist: ChatThread | null = null;
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
                        const selectedChild =
                            selectedChildByMessageId[nextLeaf] ??
                            message.children[message.children.length - 1];
                        if (!selectedChild) break;
                        selectedChildByMessageId[nextLeaf] = selectedChild;
                        nextLeaf = selectedChild;
                    }

                    const nextThread: ChatThread = {
                        ...thread,
                        selectedChildByMessageId,
                        selectedRootChild,
                        leafMessageId: nextLeaf || childId,
                    };
                    threadForPersist = nextThread;
                    return nextThread;
                })
            );

            if (threadForPersist) {
                persistThread(threadForPersist);
            }
        },
        [messages, persistThread]
    );

    const updateThreadTitle = useCallback(
        (threadId: string, title: string) => {
            let threadForPersist: ChatThread | null = null;
            setThreads((prev) =>
                prev.map((thread) => {
                    if (thread.id !== threadId) return thread;
                    const nextThread = { ...thread, title };
                    threadForPersist = nextThread;
                    return nextThread;
                })
            );
            if (threadForPersist) {
                persistThread(threadForPersist);
            }
        },
        [persistThread]
    );

    const setDraft = useCallback(
        (threadId: string, content: string) => {
            setDrafts((prev) => {
                const next = { ...prev };
                if (!content) {
                    if (next[threadId]) {
                        delete next[threadId];
                    }
                } else {
                    next[threadId] = content;
                }
                return next;
            });
            persistDraft(threadId, content);
        },
        [persistDraft]
    );

    const clearDraft = useCallback(
        (threadId: string) => {
            setDraft(threadId, '');
        },
        [setDraft]
    );

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
        setDraft,
        clearDraft,
    };

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export { ChatProvider };
