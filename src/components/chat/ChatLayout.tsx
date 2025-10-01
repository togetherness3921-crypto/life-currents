import React, { useCallback, useEffect, useState } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { ModelSelectionProvider } from '@/hooks/modelSelectionProvider';
import { McpProvider } from '@/hooks/mcpProvider';
import { ConversationContextProvider } from '@/hooks/conversationContextProvider';
import { fetchLayoutBorders, persistLayoutBorders } from '@/services/layoutPersistence';

const ChatLayout = () => {
    const DEFAULT_CHAT_LAYOUT = [20, 80] as const;
    const [chatLayout, setChatLayout] = useState<number[] | null>(null);

    useEffect(() => {
        let isMounted = true;
        const loadLayout = async () => {
            const borders = await fetchLayoutBorders();
            const position = borders['chat-horizontal-1']?.position;
            const layout = typeof position === 'number'
                ? [position, 100 - position]
                : [...DEFAULT_CHAT_LAYOUT];
            if (!borders['chat-horizontal-1']) {
                void persistLayoutBorders([
                    { borderId: 'chat-horizontal-1', axis: 'x' as const, position: layout[0] },
                ]);
            }
            if (isMounted) {
                setChatLayout(layout);
            }
        };
        void loadLayout();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleChatLayoutChange = useCallback((sizes: number[]) => {
        setChatLayout(sizes);
        void persistLayoutBorders([
            { borderId: 'chat-horizontal-1', axis: 'x' as const, position: sizes[0] },
        ]);
    }, []);

    if (!chatLayout) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                Loading chat layout...
            </div>
        );
    }

    const resolvedChatLayout = chatLayout;

    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ConversationContextProvider>
                        <ChatProvider>
                            <ResizablePanelGroup
                                direction="horizontal"
                                className="h-full w-full"
                                onLayout={handleChatLayoutChange}
                            >
                                <ResizablePanel defaultSize={resolvedChatLayout[0]} minSize={15} maxSize={30}>
                                    <ChatSidebar />
                                </ResizablePanel>
                                <ResizableHandle withHandle />
                                <ResizablePanel defaultSize={resolvedChatLayout[1]}>
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
