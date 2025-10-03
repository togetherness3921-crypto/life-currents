import React from 'react';
import { useChatContext } from '@/hooks/useChat';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';

const ChatSidebar = () => {
    const { threads, activeThreadId, setActiveThreadId, createThread } = useChatContext();

    return (
        <div className="flex h-full flex-col bg-card p-2 text-card-foreground">
            <div className="flex items-center justify-center p-2">
                <Button
                    onClick={createThread}
                    className="h-10 w-10 rounded-full p-0"
                    variant="secondary"
                    title="Start a new chat"
                >
                    <Plus className="h-4 w-4" />
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
            <footer>
                <div className="p-2 text-xs text-center text-yellow-500">Build System Test Active</div>
            </footer>
        </div>
    );
};

export default ChatSidebar;
