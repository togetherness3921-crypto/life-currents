import React from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { ModelSelectionProvider } from '@/hooks/modelSelectionProvider';
import { McpProvider } from '@/hooks/mcpProvider';
import { ConversationContextProvider } from '@/hooks/conversationContextProvider';

type ChatLayoutProps = {
    sidebarSize?: number;
    contentSize?: number;
    onLayout?: (sizes: number[]) => void;
    layoutKey?: number;
};

const ChatLayout = ({ sidebarSize = 20, contentSize = 80, onLayout, layoutKey = 0 }: ChatLayoutProps) => {
    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ConversationContextProvider>
                        <ChatProvider>
                            <ResizablePanelGroup
                                key={`chat-panels-${layoutKey}`}
                                direction="horizontal"
                                onLayout={onLayout}
                                className="h-full w-full"
                            >
                                <ResizablePanel defaultSize={sidebarSize} minSize={15} maxSize={30}>
                                    <ChatSidebar />
                                </ResizablePanel>
                                <ResizableHandle withHandle />
                                <ResizablePanel defaultSize={contentSize}>
                                    <ChatPane />
                                </ResizablePanel>
                            </ResizablePanelGroup>
                        </ChatProvider>
                    </ConversationContextProvider>
                </SystemInstructionsProvider>
            </ModelSelectionProvider>
        </McpProvider>
    );
};

export default ChatLayout;
