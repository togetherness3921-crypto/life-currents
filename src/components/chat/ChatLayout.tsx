import React, { useState } from 'react';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { ModelSelectionProvider } from '@/hooks/modelSelectionProvider';
import { McpProvider } from '@/hooks/mcpProvider';
import { ConversationContextProvider } from '@/hooks/conversationContextProvider';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const ChatLayout = () => {
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ConversationContextProvider>
                        <ChatProvider>
                            <div className="relative flex h-full w-full overflow-hidden bg-background">
                                <div
                                    className={cn(
                                        'relative h-full transition-[width] duration-300 ease-in-out',
                                        isSidebarOpen ? 'w-[40%]' : 'w-0'
                                    )}
                                    aria-hidden={!isSidebarOpen}
                                >
                                    <div
                                        className={cn(
                                            'h-full overflow-hidden border-r bg-card text-card-foreground shadow-xl transition-opacity duration-300 ease-in-out',
                                            isSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                                        )}
                                    >
                                        <ChatSidebar />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSidebarOpen((prev) => !prev)}
                                    className="z-20 flex h-full w-10 items-center justify-center border-x border-border bg-background/90 text-muted-foreground transition-colors hover:bg-background"
                                    aria-label={isSidebarOpen ? 'Hide chat list' : 'Show chat list'}
                                    aria-expanded={isSidebarOpen}
                                >
                                    {isSidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
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
