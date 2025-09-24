import { createContext, useContext, useState, ReactNode } from 'react';
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

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<MessageStore>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const getThread = (id: string) => threads.find(t => t.id === id);

  // Reconstructs a message chain by traversing backwards from a leaf
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
    setThreads(prev => [...prev, newThread]);
    setActiveThreadId(newThread.id);
    return newThread.id;
  };

  const addMessage = (threadId: string, messageData: Omit<Message, 'id'>): Message => {
    const newMessage: Message = { ...messageData, id: uuidv4() };
    
    setMessages(prev => ({ ...prev, [newMessage.id]: newMessage }));

    setThreads(prev =>
      prev.map(thread => {
        if (thread.id === threadId) {
          // Create a title from the first user message
          const chain = getMessageChain(thread.leafMessageId);
          const newTitle = chain.length === 0 && messageData.role === 'user'
            ? messageData.content.substring(0, 30) + '...'
            : thread.title;

          return { ...thread, title: newTitle, leafMessageId: newMessage.id };
        }
        return thread;
      })
    );
    return newMessage;
  };

  const updateMessage = (messageId: string, newContent: string) => {
    setMessages(prev => {
      if (!prev[messageId]) return prev;
      return {
        ...prev,
        [messageId]: {
          ...prev[messageId],
          content: newContent,
        }
      }
    });
  };

  const value = {
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

export const useChat = () => {
  const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
};
