import { createContext } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Message now includes a parentId for tree structure
export interface Message {
    id: string;
    parentId: string | null;
    role: 'user' | 'assistant';
    content: string;
}

// A map of all messages, indexed by ID
type MessageStore = Record<string, Message>;

// A thread is now just a pointer to the last message ID
export interface ChatThread {
    id: string;
    title: string;
    // Point to the ID of the last message in the thread
    leafMessageId: string | null;
    createdAt: Date;
}

interface ChatContextType {
    threads: ChatThread[];
    messages: MessageStore;
    activeThreadId: string | null;
    setActiveThreadId: (id: string | null) => void;
    getThread: (id: string) => ChatThread | undefined;
    createThread: () => string;
    addMessage: (threadId: string, message: Omit<Message, 'id'>) => Message;
    getMessageChain: (leafId: string | null) => Message[];
    updateMessage: (messageId: string, newContent: string) => void;
}

export const ChatContext = createContext<ChatContextType | undefined>(undefined);
