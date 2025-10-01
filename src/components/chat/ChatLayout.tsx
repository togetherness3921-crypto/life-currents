import React, { useCallback, useMemo } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { ModelSelectionProvider } from '@/hooks/modelSelectionProvider';
import { McpProvider } from '@/hooks/mcpProvider';
import { ConversationContextProvider } from '@/hooks/conversationContextProvider';
import { useLayoutPersistence } from '@/hooks/useLayoutPersistence';
import { computeLayoutFromBorders, persistLayoutToBorders } from '@/lib/layoutPersistence';

const ChatLayout = () => {
    const { borders, setBorderPosition } = useLayoutPersistence();
    const chatLayout = useMemo(() => computeLayoutFromBorders(['chat-horizontal-1'], borders), [borders]);
    const handleChatLayout = useCallback(
        (layout: number[]) => {
            void persistLayoutToBorders(layout, ['chat-horizontal-1'], 'x', setBorderPosition);
        },
        [setBorderPosition]
    );

    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ConversationContextProvider>
                        <ChatProvider>
                            <ResizablePanelGroup
                                direction="horizontal"
                                className="h-full w-full"
                                layout={chatLayout}
                                onLayout={handleChatLayout}
                            >
                                <ResizablePanel minSize={15} maxSize={30}>
                                    <ChatSidebar />
                                </ResizablePanel>
                                <ResizableHandle withHandle />
                                <ResizablePanel>
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
