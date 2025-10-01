import React, { useState } from 'react';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { ModelSelectionProvider } from '@/hooks/modelSelectionProvider';
import { McpProvider } from '@/hooks/mcpProvider';
import { ConversationContextProvider } from '@/hooks/conversationContextProvider';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const ChatLayout = () => {
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    const toggleSidebar = () => {
        setSidebarOpen((prev) => !prev);
    };

    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ConversationContextProvider>
                        <ChatProvider>
                            <div className="flex h-full w-full overflow-hidden bg-background">
                                <div
                                    className={cn(
                                        'relative h-full overflow-hidden border-r transition-[width] duration-300 ease-in-out',
                                        isSidebarOpen ? 'border-border' : 'border-transparent'
                                    )}
                                    style={{ width: isSidebarOpen ? '40%' : '0%' }}
                                    aria-hidden={!isSidebarOpen}
                                >
                                    <div
                                        className={cn(
                                            'h-full',
                                            isSidebarOpen ? 'opacity-100 transition-opacity duration-300' : 'pointer-events-none opacity-0'
                                        )}
                                    >
                                        <ChatSidebar />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={toggleSidebar}
                                    aria-label={isSidebarOpen ? 'Collapse chat list' : 'Expand chat list'}
                                    aria-expanded={isSidebarOpen}
                                    className="flex h-full w-8 shrink-0 items-center justify-center border-r border-border bg-background/90 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {isSidebarOpen ? (
                                        <ChevronLeft className="h-4 w-4" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4" />
                                    )}
                                </button>
                                <div className="flex-1 overflow-hidden">
                                    <ChatPane />
                                </div>
                            </div>
                        </ChatProvider>
                    </ConversationContextProvider>
                </SystemInstructionsProvider>
            </ModelSelectionProvider>
        </McpProvider>
    );
};

export default ChatLayout;
