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

const ChatLayout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ConversationContextProvider>
                        <ChatProvider>
                            <div className="relative flex h-full w-full overflow-hidden bg-background">
                                <aside
                                    className={cn(
                                        'h-full overflow-hidden border-r bg-card transition-[width] duration-300 ease-in-out',
                                        isSidebarOpen ? 'shadow-sm' : 'shadow-none'
                                    )}
                                    style={isSidebarOpen ? { width: '40%', minWidth: '280px' } : { width: '0px' }}
                                    aria-hidden={!isSidebarOpen}
                                >
                                    {isSidebarOpen && <ChatSidebar />}
                                </aside>
                                <button
                                    type="button"
                                    className="group relative z-10 flex h-full w-6 shrink-0 items-center justify-center border-r border-border bg-background/90 text-muted-foreground transition-colors hover:bg-muted"
                                    onClick={() => setIsSidebarOpen((open) => !open)}
                                    aria-label={isSidebarOpen ? 'Collapse chat list' : 'Expand chat list'}
                                    aria-expanded={isSidebarOpen}
                                >
                                    {isSidebarOpen ? (
                                        <ChevronLeft className="h-4 w-4" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4" />
                                    )}
                                </button>
                                <main className="flex-1 overflow-hidden">
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
