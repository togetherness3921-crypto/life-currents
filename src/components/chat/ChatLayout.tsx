import React from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { McpProvider } from '@/hooks/mcpProvider';
import { ModelProvider } from '@/hooks/modelProvider';

const ChatLayout = () => {
    return (
        <McpProvider>
            <SystemInstructionsProvider>
                <ModelProvider>
                    <ChatProvider>
                        <ResizablePanelGroup direction="horizontal" className="h-full w-full">
                            <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
                                <ChatSidebar />
                            </ResizablePanel>
                            <ResizableHandle withHandle />
                            <ResizablePanel>
                                <ChatPane />
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </ChatProvider>
                </ModelProvider>
            </SystemInstructionsProvider>
        </McpProvider>
    );
};

export default ChatLayout;
