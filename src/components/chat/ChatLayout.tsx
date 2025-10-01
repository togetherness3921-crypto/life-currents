import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { ModelSelectionProvider } from '@/hooks/modelSelectionProvider';
import { McpProvider } from '@/hooks/mcpProvider';
import { ConversationContextProvider } from '@/hooks/conversationContextProvider';
import { cn } from '@/lib/utils';

const SIDEBAR_WIDTH_PERCENT = 40;

const ChatLayout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ConversationContextProvider>
                        <ChatProvider>
                            <div className="relative flex h-full w-full overflow-hidden">
                                <div
                                    className={cn(
                                        'relative h-full shrink-0 transition-[width] duration-300 ease-in-out',
                                        isSidebarOpen ? 'w-[40%]' : 'w-0'
                                    )}
                                    style={isSidebarOpen ? { width: `${SIDEBAR_WIDTH_PERCENT}%` } : undefined}
                                    aria-hidden={!isSidebarOpen}
                                >
                                    <div
                                        className={cn(
                                            'absolute inset-0 h-full w-full bg-card text-card-foreground transition-opacity duration-300 ease-in-out',
                                            isSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                                        )}
                                    >
                                        <ChatSidebar />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsSidebarOpen((prev) => !prev)}
                                    aria-label={isSidebarOpen ? 'Collapse chat list' : 'Expand chat list'}
                                    aria-expanded={isSidebarOpen}
                                    className={cn(
                                        'z-10 flex h-full w-10 shrink-0 items-center justify-center border-r border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:text-foreground'
                                    )}
                                >
                                    {isSidebarOpen ? (
                                        <ChevronLeft className="h-4 w-4" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4" />
                                    )}
                                </button>
                                <div className="flex-1">
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
