import React from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';

const ChatLayout = () => {
    return (
        <SystemInstructionsProvider>
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
        </SystemInstructionsProvider>
    );
};

export default ChatLayout;
