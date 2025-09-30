import React from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { McpProvider } from '@/hooks/mcpProvider';
import { ModelPreferenceProvider } from '@/hooks/modelPreferenceProvider';

const ChatLayout = () => {
    return (
        <McpProvider>
            <SystemInstructionsProvider>
                <ModelPreferenceProvider>
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
                </ModelPreferenceProvider>
            </SystemInstructionsProvider>
        </McpProvider>
    );
};

export default ChatLayout;
