import React from 'react';
import { useChat } from '@/hooks/useChat';
import { Button } from '../ui/button';
import { PlusCircle } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '@/lib/utils';

const ChatSidebar = () => {
  const { threads, activeThreadId, setActiveThreadId, createThread } = useChat();

  return (
    <div className="flex h-full flex-col bg-card p-2 text-card-foreground">
      <div className="p-2">
        <Button onClick={createThread} className="w-full">
          <PlusCircle className="mr-2 h-4 w-4" />
          New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-2">
          {threads
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((thread) => (
              <div
                key={thread.id}
                onClick={() => setActiveThreadId(thread.id)}
                className={cn(
                  'cursor-pointer rounded-md p-2 text-sm hover:bg-muted',
                  activeThreadId === thread.id && 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                <p className="truncate">{thread.title}</p>
              </div>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ChatSidebar;
