import React, { useMemo, useState } from 'react';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { ModelSelectionProvider } from '@/hooks/modelSelectionProvider';
import { McpProvider } from '@/hooks/mcpProvider';
import { ConversationContextProvider } from '@/hooks/conversationContextProvider';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SIDEBAR_WIDTH_PERCENT = 40;

const ChatLayout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const toggleButtonLeft = useMemo(() => {
        if (isSidebarOpen) {
            return `calc(${SIDEBAR_WIDTH_PERCENT}% - 16px)`;
        }
        return '0px';
    }, [isSidebarOpen]);

    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ConversationContextProvider>
                        <ChatProvider>
                            <div className="relative flex h-full w-full overflow-hidden bg-background">
                                <div
                                    className="relative h-full transition-[width] duration-300 ease-in-out"
                                    style={{ width: isSidebarOpen ? `${SIDEBAR_WIDTH_PERCENT}%` : '0%' }}
                                >
                                    <div
                                        className={cn(
                                            'absolute inset-0 flex h-full flex-col transition-opacity duration-300 ease-in-out',
                                            isSidebarOpen
                                                ? 'pointer-events-auto opacity-100'
                                                : 'pointer-events-none opacity-0'
                                        )}
                                    >
                                        <ChatSidebar />
                                    </div>
                                </div>
                                <div className="flex-1 transition-all duration-300 ease-in-out">
                                    <ChatPane />
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="absolute top-1/2 z-30 -translate-y-1/2 rounded-r-md border border-border bg-card text-card-foreground shadow-md hover:bg-card/90"
                                    style={{ left: toggleButtonLeft }}
                                    onClick={() => setIsSidebarOpen((prev) => !prev)}
                                    aria-label={isSidebarOpen ? 'Collapse chat list' : 'Expand chat list'}
                                    aria-expanded={isSidebarOpen}
                                >
                                    {isSidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </Button>
                            </div>
                        </ChatProvider>
                    </ConversationContextProvider>
                </SystemInstructionsProvider>
            </ModelSelectionProvider>
        </McpProvider>
    );
};

export default ChatLayout;
