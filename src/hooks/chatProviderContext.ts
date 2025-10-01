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
    threadId: string;
    parentId: string | null;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    thinking?: string;
    children: string[];
    toolCalls?: ToolCallState[];
    createdAt?: Date;
    updatedAt?: Date;
}

export type MessageStore = Record<string, Message>;

export interface ChatThreadMetadata {
    leafMessageId: string | null;
    rootChildren: string[];
    selectedChildByMessageId: Record<string, string>;
    selectedRootChild?: string;
}

export interface ChatThread extends ChatThreadMetadata {
    id: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ChatContextValue {
    threads: ChatThread[];
    messages: MessageStore;
    drafts: Record<string, string>;
    activeThreadId: string | null;

    setActiveThreadId: (id: string | null) => void;
    getThread: (id: string) => ChatThread | undefined;
    createThread: () => string;
    addMessage: (
        threadId: string,
        message: Omit<Message, 'id' | 'children' | 'threadId'> & { id?: string }
    ) => Message;
    getMessageChain: (leafId: string | null) => Message[];
    updateMessage: (
        messageId: string,
        updates: Partial<Message> | ((message: Message) => Partial<Message>)
    ) => void;
    selectBranch: (threadId: string | null, parentId: string | null, childId: string) => void;
    updateThreadTitle: (threadId: string, title: string) => void;
    updateDraft: (threadId: string, draftText: string) => void;
    clearDraft: (threadId: string) => void;
}

export const ChatContext = createContext<ChatContextValue | undefined>(undefined);
