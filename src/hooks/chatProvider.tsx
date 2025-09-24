import { ReactNode, useState } from 'react';
import { ChatContext, Message, ChatThread } from './chatProviderContext';
import { v4 as uuidv4 } from 'uuid';
import { useChatContextData } from './useChatContextData';

type MessageStore = Record<string, Message>;

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<MessageStore>({});
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const getThread = (id: string) => threads.find(t => t.id === id);

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
      };
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

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};
}
