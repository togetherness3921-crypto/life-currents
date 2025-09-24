import { ReactNode, useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    ChatContext,
    Message,
    ChatThread,
    MessageStore,
    ChatContextValue,
} from './chatProviderContext';

const THREADS_STORAGE_KEY = 'chat_threads';
const MESSAGES_STORAGE_KEY = 'chat_messages';

export const ChatProvider = ({ children }: { children: ReactNode }) => {
    const [threads, setThreads] = useState<ChatThread[]>(() => {
        try {
            const storedThreads = localStorage.getItem(THREADS_STORAGE_KEY);
            if (!storedThreads) return [];
            const parsed: ChatThread[] = JSON.parse(storedThreads);
            return parsed.map((thread) => {
                const rootChildren = thread.rootChildren || [];
                return {
                    ...thread,
                    createdAt: thread.createdAt ? new Date(thread.createdAt) : new Date(),
                    selectedChildByMessageId: thread.selectedChildByMessageId || {},
                    rootChildren,
                    selectedRootChild: thread.selectedRootChild ?? rootChildren[rootChildren.length - 1],
                };
            });
        } catch (e) {
            console.error("Failed to parse threads from localStorage", e);
            return [];
        }
    });

    const [messages, setMessages] = useState<MessageStore>(() => {
        try {
            const storedMessages = localStorage.getItem(MESSAGES_STORAGE_KEY);
            if (!storedMessages) return {};
            const parsed: MessageStore = JSON.parse(storedMessages);
            Object.keys(parsed).forEach((id) => {
                parsed[id].children = parsed[id].children || [];
            });
            return parsed;
        } catch (e) {
            console.error("Failed to parse messages from localStorage", e);
            return {};
        }
    });

    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

    // Save to localStorage whenever threads or messages change
    useEffect(() => {
        try {
            localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads));
        } catch (e) {
            console.error("Failed to save threads to localStorage", e);
        }
    }, [threads]);

    useEffect(() => {
        try {
            localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(messages));
        } catch (e) {
            console.error("Failed to save messages to localStorage", e);
        }
    }, [messages]);


    const getThread = useCallback((id: string) => threads.find((t) => t.id === id), [threads]);

    const getMessageChain = useCallback((leafId: string | null): Message[] => {
        if (!leafId) return [];
        const chain: Message[] = [];
        let currentId: string | null = leafId;
        while (currentId) {
            const message = messages[currentId];
            if (!message) break;
            chain.unshift(message);
            currentId = message.parentId;
        }
        return chain;
    }, [messages]);

    const createThread = useCallback(() => {
        const newThread: ChatThread = {
            id: uuidv4(),
            title: 'New Chat',
            leafMessageId: null,
            createdAt: new Date(),
            selectedChildByMessageId: {},
            rootChildren: [],
        };
        setThreads((prev) => [...prev, newThread]);
        setActiveThreadId(newThread.id);
        return newThread.id;
    }, []);

    const addMessage = useCallback(
        (
            threadId: string,
            messageData: Omit<Message, 'id' | 'children'>
        ): Message => {
            const newId = uuidv4();
            const newMessage: Message = { ...messageData, id: newId, children: [], toolCalls: messageData.toolCalls ?? [] };

            setMessages((prev) => {
                const updated = {
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

                    return {
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
                })
            );
            return newMessage;
        },
        []
    );

    const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
        console.log(`[ChatProvider] Updating message ${messageId} with updates:`, updates);
        setMessages((prev) => {
            const current = prev[messageId];
            if (!current) {
                console.warn(`[ChatProvider] Attempted to update non-existent message: ${messageId}`);
                return prev;
            }
            const updatedMessages = {
                ...prev,
                [messageId]: {
                    ...current,
                    ...updates,
                },
            };
            console.log(`[ChatProvider] Message ${messageId} updated in state store.`);
            return updatedMessages;
        });
    }, []);

    const selectBranch = useCallback((threadId: string | null, parentId: string | null, childId: string) => {
        if (!threadId) return;
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
                    const selectedChild = selectedChildByMessageId[nextLeaf] ?? message.children[message.children.length - 1];
                    selectedChildByMessageId[nextLeaf] = selectedChild;
                    nextLeaf = selectedChild;
                }

                return {
                    ...thread,
                    selectedChildByMessageId,
                    selectedRootChild,
                    leafMessageId: nextLeaf || childId,
                };
            })
        );
    }, [messages]);

    const updateThreadTitle = useCallback((threadId: string, title: string) => {
        setThreads((prev) =>
            prev.map((thread) => (thread.id === threadId ? { ...thread, title } : thread))
        );
    }, []);

    const value: ChatContextValue = {
        threads,
        messages,
        activeThreadId,
        setActiveThreadId,
        getThread,
        createThread,
        addMessage,
        getMessageChain,
        updateMessage,
        selectBranch,
        updateThreadTitle,
    };

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
