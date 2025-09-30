import { createContext } from 'react';

export interface ToolCallState {
    id: string;
    name: string;
    arguments: string;
    status: 'pending' | 'running' | 'success' | 'error';
    response?: string;
    error?: string;
}

export interface Message {
    id: string;
    parentId: string | null; 
    role: 'user' | 'assistant';
    content: string;
    thinking?: string;
    children: string[];
    toolCalls?: ToolCallState[];
}

export type MessageStore = Record<string, Message>;

export interface ChatThread {
    id: string;
    title: string;
    leafMessageId: string | null;
    createdAt: Date;
    selectedChildByMessageId: Record<string, string>;
    rootChildren: string[];
    selectedRootChild?: string;
}

export interface ChatContextValue {
    threads: ChatThread[];
    messages: MessageStore;
    activeThreadId: string | null;
    
    setActiveThreadId: (id: string | null) => void;
    getThread: (id: string) => ChatThread | undefined;
    createThread: () => string;
    addMessage: (threadId: string, message: Omit<Message, 'id' | 'children'>) => Message;
    getMessageChain: (leafId: string | null) => Message[];
    updateMessage: (messageId: string, updates: Partial<Message>) => void;
    selectBranch: (threadId: string | null, parentId: string | null, childId: string) => void;
    updateThreadTitle: (threadId: string, title: string) => void;
}

export const ChatContext = createContext<ChatContextValue | undefined>(undefined);
