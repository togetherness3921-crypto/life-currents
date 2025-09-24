import { ReactNode, useState, useEffect } from 'react';
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


    const getThread = (id: string) => threads.find((t) => t.id === id);

    const getMessageChain = (leafId: string | null): Message[] => {
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
    };

    const createThread = () => {
        const newThread: ChatThread = {
            id: uuidv4(),
            title: 'New Chat',
            leafMessageId: null,
            createdAt: new Date(),
        };
        setThreads((prev) => [...prev, newThread]);
        setActiveThreadId(newThread.id);
        return newThread.id;
    };

    const addMessage = (
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
    };

    const updateMessage = (messageId: string, newContent: string) => {
        setMessages((prev) => {
            if (!prev[messageId]) return prev;
            return {
                ...prev,
                [messageId]: {
                    ...prev[messageId],
                    content: newContent,
                },
            };
        });
    };

    const appendMessageContent = (messageId: string, contentChunk: string) => {
        setMessages(prev => {
            if (!prev[messageId]) return prev;
            return {
                ...prev,
                [messageId]: {
                    ...prev[messageId],
                    content: prev[messageId].content + contentChunk,
                }
            }
        });
    };

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
        appendMessageContent,
    };

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
