import { createContext, useContext, useState, ReactNode } from 'react';
import { Message } from './ChatMessage';
import { v4 as uuidv4 } from 'uuid';

export interface ChatThread {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

interface ChatContextType {
  threads: ChatThread[];
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  getThread: (id: string) => ChatThread | undefined;
  createThread: () => string;
  addMessage: (threadId: string, message: Omit<Message, 'id'>) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const getThread = (id: string) => threads.find(t => t.id === id);

  const createThread = () => {
    const newThread: ChatThread = {
      id: uuidv4(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
    };
    setThreads(prev => [...prev, newThread]);
    setActiveThreadId(newThread.id);
    return newThread.id;
  };

  const addMessage = (threadId: string, message: Omit<Message, 'id'>) => {
    setThreads(prev =>
      prev.map(thread => {
        if (thread.id === threadId) {
          const newMessage: Message = { ...message, id: uuidv4() };
          // Create a title from the first user message
          const newTitle = thread.messages.length === 0 && message.role === 'user' 
            ? message.content.substring(0, 30) + '...'
            : thread.title;

          return { ...thread, title: newTitle, messages: [...thread.messages, newMessage] };
        }
        return thread;
      })
    );
  };

  const value = {
    threads,
    activeThreadId,
    setActiveThreadId,
    getThread,
    createThread,
    addMessage,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
