import React, { useState, FormEvent, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import { getGeminiResponse } from '@/services/openRouter';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Send, Loader2, PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { useChatContext } from '@/hooks/useChat';

const ChatPane = () => {
    const {
        activeThreadId,
        getThread,
        addMessage,
        createThread,
        getMessageChain,
        updateMessage,
        selectBranch,
        messages: allMessages // get all messages for parent lookup
    } = useChatContext();

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    const activeThread = activeThreadId ? getThread(activeThreadId) : null;
    const messages = getMessageChain(activeThread?.leafMessageId || null);

    useEffect(() => {
        // Scroll to bottom when new messages are added
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTo({
                top: scrollAreaRef.current.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, [messages.length, streamingMessageId]);


    const submitMessage = async (content: string, threadId: string, parentId: string | null) => {
        setIsLoading(true);
        console.log('[ChatPane] submitMessage called with:', { content, threadId, parentId }); // LOG 6: User action initiated

        // Build payload for API using existing conversation + new user input
        const historyChain = parentId ? getMessageChain(parentId) : [];
        const apiMessages = [...historyChain.map(({ role, content }) => ({ role, content })), { role: 'user', content }];
        console.log('[ChatPane] Sending payload to API:', apiMessages); // LOG 7: API payload confirmed

        // Add user message to state for UI
        const userMessage = addMessage(threadId, { role: 'user', content, parentId });

        // Add a blank assistant message to begin streaming
        const assistantMessage = addMessage(threadId, { role: 'assistant', content: '', parentId: userMessage.id });
        setStreamingMessageId(assistantMessage.id);

        try {
            await getGeminiResponse(apiMessages, (update) => {
                if (update.content !== undefined) {
                    updateMessage(assistantMessage.id, { content: update.content });
                }
                if (update.reasoning !== undefined) {
                    updateMessage(assistantMessage.id, { thinking: update.reasoning });
                }
            });

        } catch (error) {
            const errorMessage = `Error: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`;
            updateMessage(assistantMessage.id, errorMessage);
        } finally {
            setIsLoading(false);
            setStreamingMessageId(null);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        let currentThreadId = activeThreadId;
        if (!currentThreadId) {
            currentThreadId = createThread();
        }

        const userInput = input;
        setInput('');

        const currentChain = getMessageChain(activeThread?.leafMessageId || null);
        const parentId = currentChain.length > 0 ? currentChain[currentChain.length - 1].id : null;

        await submitMessage(userInput, currentThreadId, parentId);
    };

    const handleFork = async (originalMessageId: string, newContent: string) => {
        if (!activeThreadId) return;

        const originalMessage = allMessages[originalMessageId];
        if (!originalMessage) return;

        // The new message forks from the parent of the original message
        await submitMessage(newContent, activeThreadId, originalMessage.parentId);
    };

    const handleNavigateBranch = (messageId: string, direction: 'prev' | 'next') => {
        if (!activeThreadId || !activeThread) return;
        const message = allMessages[messageId];
        if (!message || message.children.length === 0) return;

        const selectedChild = activeThread.selectedChildByMessageId[messageId];
        const children = message.children;
        let index = selectedChild ? children.indexOf(selectedChild) : -1;
        if (index === -1) {
            index = children.length - 1;
        }

        if (direction === 'prev') {
            index = (index - 1 + children.length) % children.length;
        } else {
            index = (index + 1) % children.length;
        }

        const targetChild = children[index];
        selectBranch(activeThreadId, messageId, targetChild);
    };

    if (!activeThread) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center bg-background">
                <Button onClick={createThread}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Chat
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-background">
            <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
                <div className="flex flex-col gap-4">
                    {messages.map((msg) => {
                        const messageChildren = msg.children;
                        const totalBranches = messageChildren.length;
                        let selectedChildId = activeThread?.selectedChildByMessageId[msg.id];
                        if (totalBranches > 0 && (!selectedChildId || !messageChildren.includes(selectedChildId))) {
                            selectedChildId = messageChildren[messageChildren.length - 1];
                        }
                        const branchIndex = selectedChildId ? messageChildren.indexOf(selectedChildId) : -1;

                        return (
                            <ChatMessage
                                key={msg.id}
                                message={msg}
                                onSave={handleFork}
                                isStreaming={msg.id === streamingMessageId}
                                branchInfo={
                                    totalBranches > 0
                                        ? {
                                            index: branchIndex >= 0 ? branchIndex : 0,
                                            total: totalBranches,
                                            onPrev: () => handleNavigateBranch(msg.id, 'prev'),
                                            onNext: () => handleNavigateBranch(msg.id, 'next'),
                                        }
                                        : undefined
                                }
                            />
                        );
                    })}
                </div>
            </ScrollArea>
            <div className="border-t p-4">
                <form onSubmit={handleSubmit} className="flex items-center gap-2">
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask anything..."
                        disabled={isLoading}
                        className="flex-1"
                    />
                    <Button type="submit" disabled={isLoading || !input.trim()}>
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default ChatPane;
