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
            return parsed.map((thread) => ({
                ...thread,
                createdAt: thread.createdAt ? new Date(thread.createdAt) : new Date(),
            }));
        } catch (e) {
            console.error("Failed to parse threads from localStorage", e);
            return [];
        }
    });

    const [messages, setMessages] = useState<MessageStore>(() => {
        try {
            const storedMessages = localStorage.getItem(MESSAGES_STORAGE_KEY);
            return storedMessages ? JSON.parse(storedMessages) : {};
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
        };
        setThreads((prev) => [...prev, newThread]);
        setActiveThreadId(newThread.id);
        return newThread.id;
    }, []);

    const addMessage = useCallback(
        (
            threadId: string,
            messageData: Omit<Message, 'id'>
        ): Message => {
            const newMessage: Message = { ...messageData, id: uuidv4() };

            setMessages((prev) => ({ ...prev, [newMessage.id]: newMessage }));

            setThreads((prev) =>
                prev.map((thread) => {
                    if (thread.id === threadId) {
                        const chain = getMessageChain(thread.leafMessageId);
                        const newTitle =
                            chain.length === 0 && messageData.role === 'user'
                                ? `${messageData.content.substring(0, 30)}...`
                                : thread.title;

                        return { ...thread, title: newTitle, leafMessageId: newMessage.id };
                    }
                    return thread;
                })
            );
            return newMessage;
        },
        [getMessageChain]
    );

    const updateMessage = useCallback((messageId: string, newContent: string) => {
        console.log(`[ChatProvider] Updating message ${messageId} with new content:`, newContent); // LOG 4: State update function called
        setMessages((prev) => {
            if (!prev[messageId]) {
                console.warn(`[ChatProvider] Attempted to update non-existent message: ${messageId}`);
                return prev;
            }
            const updatedMessages = {
                ...prev,
                [messageId]: {
                    ...prev[messageId],
                    content: newContent,
                },
            };
            console.log(`[ChatProvider] Message ${messageId} updated in state store.`); // LOG 5: State object updated
            return updatedMessages;
        });
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
    };

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
