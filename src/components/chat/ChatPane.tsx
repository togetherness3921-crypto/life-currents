import React, { useState, FormEvent, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import { getGeminiResponse } from '@/services/openRouter';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Send, Loader2, PlusCircle } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { useChat } from '@/hooks/useChat';

const ChatPane = () => {
  const { 
    activeThreadId, 
    getThread, 
    addMessage, 
    createThread,
    getMessageChain 
  } = useChat();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const activeThread = activeThreadId ? getThread(activeThreadId) : null;
  const messages = getMessageChain(activeThread?.leafMessageId || null);

  useEffect(() => {
    // Scroll to bottom when new messages are added
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages.length]);


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    let currentThreadId = activeThreadId;
    if (!currentThreadId) {
      currentThreadId = createThread();
    }
    
    const userInput = input;
    setInput('');
    setIsLoading(true);

    try {
      // Get the current message chain to determine the parent of the new message
      const currentChain = getMessageChain(getThread(currentThreadId)?.leafMessageId || null);
      const parentId = currentChain.length > 0 ? currentChain[currentChain.length - 1].id : null;

      // Add user message
      const userMessage = addMessage(currentThreadId, { role: 'user', content: userInput, parentId });
      
      const apiMessages = [...currentChain, userMessage].map(({ role, content }) => ({ role, content }));
      
      const assistantResponse = await getGeminiResponse(apiMessages);

      addMessage(currentThreadId, { role: 'assistant', content: assistantResponse, parentId: userMessage.id });
    } catch (error) {
      const errorMessage = `Error: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`;
      // Find the last message to append the error message to
      const currentChain = getMessageChain(getThread(currentThreadId)?.leafMessageId || null);
      const parentId = currentChain.length > 0 ? currentChain[currentChain.length - 1].id : null;
      addMessage(currentThreadId, { role: 'assistant', content: errorMessage, parentId });
    } finally {
      setIsLoading(false);
    }
  };

  if (!activeThread) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-background">
        <Button onClick={createThread}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="flex flex-col gap-4">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatPane;
