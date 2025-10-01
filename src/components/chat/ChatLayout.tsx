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
                            <div className="relative flex h-full w-full overflow-hidden">
                                <aside
                                    id="chat-sidebar"
                                    className={cn(
                                        'relative h-full overflow-hidden border-r bg-card transition-[width] duration-300 ease-in-out',
                                        isSidebarOpen ? 'w-[40%]' : 'w-0 border-transparent'
                                    )}
                                    aria-hidden={!isSidebarOpen}
                                >
                                    <div
                                        className={cn(
                                            'h-full w-full transition-opacity duration-200 ease-in-out',
                                            isSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                                        )}
                                    >
                                        <ChatSidebar />
                                    </div>
                                </aside>
                                <button
                                    type="button"
                                    onClick={() => setSidebarOpen((prev) => !prev)}
                                    className={cn(
                                        'absolute top-1/2 z-20 flex h-24 w-8 -translate-y-1/2 items-center justify-center border border-border bg-background text-muted-foreground shadow-md transition-all duration-300 ease-in-out',
                                        isSidebarOpen
                                            ? 'left-[40%] -translate-x-1/2 rounded-l-md rounded-r-none'
                                            : 'left-0 rounded-r-md'
                                    )}
                                    aria-controls="chat-sidebar"
                                    aria-expanded={isSidebarOpen}
                                    title={isSidebarOpen ? 'Hide chat list' : 'Show chat list'}
                                >
                                    {isSidebarOpen ? (
                                        <ChevronLeft className="h-4 w-4" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4" />
                                    )}
                                </button>
                                <main className="flex-1 h-full">
                                    <ChatPane />
                                </main>
                            </div>
                        </ChatProvider>
                    </ConversationContextProvider>
                </SystemInstructionsProvider>
            </ModelSelectionProvider>
        </McpProvider>
    );
};

export default ChatLayout;
