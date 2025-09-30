import React from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { ContextSettingsProvider } from '@/hooks/contextSettingsProvider';
import { ModelSelectionProvider } from '@/hooks/modelSelectionProvider';
import { McpProvider } from '@/hooks/mcpProvider';

const ChatLayout = () => {
    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ContextSettingsProvider>
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
                    </ContextSettingsProvider>
                </SystemInstructionsProvider>
            </ModelSelectionProvider>
        </McpProvider>
    );
};

export default ChatLayout;
