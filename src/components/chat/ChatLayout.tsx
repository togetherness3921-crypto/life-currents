import React, { useCallback, useEffect, useState } from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui/resizable';
import ChatSidebar from './ChatSidebar';
import ChatPane from './ChatPane';
import { ChatProvider } from '@/hooks/chatProvider';
import { SystemInstructionsProvider } from '@/hooks/systemInstructionProvider';
import { ModelSelectionProvider } from '@/hooks/modelSelectionProvider';
import { McpProvider } from '@/hooks/mcpProvider';
import { ConversationContextProvider } from '@/hooks/conversationContextProvider';
import { loadLayoutBorders, saveLayoutBorders, LayoutBorderId } from '@/services/layoutPersistence';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const normalizeChatSizes = (position?: number | null, fallback: [number, number] = [20, 80]): [number, number] => {
    const safeFirst = clamp(
        typeof position === 'number' && !Number.isNaN(position) ? position : fallback[0],
        15,
        30
    );
    return [safeFirst, 100 - safeFirst];
};

const ChatLayout = () => {
    const [chatSizes, setChatSizes] = useState<[number, number]>([20, 80]);
    const [layoutKey, setLayoutKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const hydrate = async () => {
            const borders = await loadLayoutBorders();
            if (cancelled) return;
            const nextSizes = normalizeChatSizes(borders[LayoutBorderId.ChatSidebar]?.position, [20, 80]);
            setChatSizes(nextSizes);
            setLayoutKey((key) => key + 1);
        };
        hydrate();
        return () => {
            cancelled = true;
        };
    }, []);

    const handleLayout = useCallback((sizes: number[]) => {
        if (!Array.isArray(sizes) || sizes.length < 2) return;
        const normalized = normalizeChatSizes(sizes[0]);
        setChatSizes(normalized);
        void saveLayoutBorders([
            { border_id: LayoutBorderId.ChatSidebar, axis: 'x', position: normalized[0] },
        ]);
    }, []);

    return (
        <McpProvider>
            <ModelSelectionProvider>
                <SystemInstructionsProvider>
                    <ConversationContextProvider>
                        <ChatProvider>
                            <ResizablePanelGroup
                                key={layoutKey}
                                direction="horizontal"
                                className="h-full w-full"
                                onLayout={handleLayout}
                            >
                                <ResizablePanel defaultSize={chatSizes[0]} minSize={15} maxSize={30}>
                                    <ChatSidebar />
                                </ResizablePanel>
                                <ResizableHandle withHandle />
                                <ResizablePanel defaultSize={chatSizes[1]}>
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
