import React from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/useChat';

const ChatLayout = () => {
  return (
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
  );
};

export default ChatLayout;
