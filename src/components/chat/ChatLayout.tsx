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
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ConversationContextProvider>
                        <ChatProvider>
                            <div className="flex h-full w-full overflow-hidden">
                                <div
                                    className={cn(
                                        'relative h-full transition-all duration-300 ease-in-out',
                                        isSidebarOpen ? 'w-[40vw]' : 'w-0'
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'h-full overflow-hidden border-r bg-card text-card-foreground shadow-sm transition-opacity duration-300',
                                            isSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                                        )}
                                    >
                                        <ChatSidebar />
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSidebarOpen((prev) => !prev)}
                                    className="flex h-full w-10 items-center justify-center border-r bg-background text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    aria-label={isSidebarOpen ? 'Collapse chat list' : 'Expand chat list'}
                                    aria-expanded={isSidebarOpen}
                                >
                                    {isSidebarOpen ? (
                                        <ChevronLeft className="h-4 w-4" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4" />
                                    )}
                                </button>
                                <div className="flex-1 h-full overflow-hidden">
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
