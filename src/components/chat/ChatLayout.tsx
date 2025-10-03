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
                            <div className="flex h-full w-full overflow-hidden bg-background">
                                <div
                                    className={cn(
                                        'relative h-full transition-all duration-300 ease-in-out',
                                        isSidebarOpen ? 'w-[40%] min-w-[40%]' : 'w-0 min-w-0'
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'h-full w-full overflow-hidden border-r bg-card text-card-foreground shadow-sm transition-opacity duration-300',
                                            isSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                                        )}
                                    >
                                        <ChatSidebar />
                                    </div>
                                </div>
                                <div className="flex h-full w-8 items-center justify-center">
                                    <button
                                        type="button"
                                        onClick={() => setIsSidebarOpen((prev) => !prev)}
                                        className="group flex h-24 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-md transition-colors hover:bg-muted/80"
                                        aria-expanded={isSidebarOpen}
                                        aria-label={isSidebarOpen ? 'Collapse chat list' : 'Expand chat list'}
                                    >
                                        {isSidebarOpen ? (
                                            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                        )}
                                    </button>
                                </div>
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
