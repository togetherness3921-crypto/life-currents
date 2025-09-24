import React, { useState, FormEvent, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import { getGeminiResponse, getTitleSuggestion, type ApiToolDefinition } from '@/services/openRouter';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Send, Square, PlusCircle, ChevronLeft, ChevronRight, Cog } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { useChatContext } from '@/hooks/useChat';
import { useSystemInstructions } from '@/hooks/useSystemInstructions';
import SystemInstructionDialog from './SystemInstructionDialog';
import { useMcp } from '@/hooks/useMcp';

const ChatPane = () => {
    const {
        activeThreadId,
        getThread,
        addMessage,
        createThread,
        getMessageChain,
        updateMessage,
        selectBranch,
        updateThreadTitle,
        messages: allMessages // get all messages for parent lookup
    } = useChatContext();

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
    const [isInstructionDialogOpen, setInstructionDialogOpen] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const { activeInstruction } = useSystemInstructions();
    const { tools: availableTools, callTool } = useMcp();

    const activeThread = activeThreadId ? getThread(activeThreadId) : null;
    const selectedLeafId = activeThread?.leafMessageId || activeThread?.selectedRootChild || null;
    const messages = getMessageChain(selectedLeafId);

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
        const systemPrompt = activeInstruction?.content;
        const apiMessages = [
            ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
            ...historyChain.map(({ role, content }) => ({ role, content })),
            { role: 'user' as const, content },
        ];
        const toolDefinitions: ApiToolDefinition[] = availableTools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
            },
        }));
        console.log('[ChatPane] Sending payload to API:', apiMessages); // LOG 7: API payload confirmed

        // Add user message to state for UI
        const userMessage = addMessage(threadId, { role: 'user', content, parentId });

        // Add a blank assistant message to begin streaming
        const assistantMessage = addMessage(threadId, { role: 'assistant', content: '', parentId: userMessage.id, toolCalls: [] });
        setStreamingMessageId(assistantMessage.id);

        try {
            const controller = new AbortController();
            abortControllerRef.current = controller;

            const { raw } = await getGeminiResponse(apiMessages, {
                onStream: (update) => {
                    if (update.content !== undefined) {
                        updateMessage(assistantMessage.id, { content: update.content });
                    }
                    if (update.reasoning !== undefined) {
                        updateMessage(assistantMessage.id, { thinking: update.reasoning });
                    }
                    if (update.toolCall) {
                        updateMessage(assistantMessage.id, (current) => {
                            const toolCalls = [...(current.toolCalls || [])];
                            const existingIndex = toolCalls.findIndex((call) => call.id === update.toolCall!.id);
                            if (existingIndex >= 0) {
                                toolCalls[existingIndex] = {
                                    ...toolCalls[existingIndex],
                                    name: update.toolCall.name ?? toolCalls[existingIndex].name,
                                    arguments: update.toolCall.arguments ?? toolCalls[existingIndex].arguments,
                                    status: update.toolCall.status === 'finish' ? 'success' : 'running',
                                };
                            } else {
                                toolCalls.push({
                                    id: update.toolCall.id,
                                    name: update.toolCall.name ?? update.toolCall.id,
                                    arguments: update.toolCall.arguments ?? '{}',
                                    status: 'running',
                                });
                            }
                            return { toolCalls };
                        });
                    }
                },
                signal: controller.signal,
                tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
            });

            const toolCallRequests = raw?.choices?.[0]?.message?.tool_calls;
            if (toolCallRequests && Array.isArray(toolCallRequests) && toolCallRequests.length > 0) {
                for (const toolCallRequest of toolCallRequests) {
                    const toolId = toolCallRequest.id;
                    const toolName = toolCallRequest.function?.name;
                    let toolArgs: Record<string, unknown> = {};
                    try {
                        toolArgs = toolCallRequest.function?.arguments ? JSON.parse(toolCallRequest.function.arguments) : {};
                    } catch (parseError) {
                        console.error('Failed to parse tool arguments', parseError);
                    }

                    updateMessage(assistantMessage.id, (current) => {
                        const toolCalls = [...(current.toolCalls || [])];
                        const existingIndex = toolCalls.findIndex((call) => call.id === toolId);
                        if (existingIndex >= 0) {
                            toolCalls[existingIndex] = {
                                ...toolCalls[existingIndex],
                                name: toolName ?? toolCalls[existingIndex].name,
                                arguments: toolCallRequest.function?.arguments ?? toolCalls[existingIndex].arguments,
                                status: 'running',
                            };
                        } else {
                            toolCalls.push({
                                id: toolId,
                                name: toolName ?? toolId,
                                arguments: toolCallRequest.function?.arguments ?? '{}',
                                status: 'running',
                            });
                        }
                        return { toolCalls };
                    });

                    try {
                        const toolResult = await callTool(toolName, toolArgs);
                        const toolContent = JSON.stringify(toolResult?.content ?? '', null, 2);

                        updateMessage(assistantMessage.id, (current) => {
                            const toolCalls = [...(current.toolCalls || [])];
                            const existingIndex = toolCalls.findIndex((call) => call.id === toolId);
                            if (existingIndex >= 0) {
                                toolCalls[existingIndex] = {
                                    ...toolCalls[existingIndex],
                                    status: 'success',
                                    response: toolContent,
                                };
                            }
                            return { toolCalls };
                        });

                        const followUpMessages = [
                            ...apiMessages,
                            {
                                role: 'tool' as const,
                                tool_call_id: toolId,
                                name: toolName ?? toolId,
                                content: toolContent,
                            },
                        ];

                        await getGeminiResponse(followUpMessages, {
                            onStream: (update) => {
                                if (update.content !== undefined) {
                                    updateMessage(assistantMessage.id, { content: update.content });
                                }
                                if (update.reasoning !== undefined) {
                                    updateMessage(assistantMessage.id, { thinking: update.reasoning });
                                }
                            },
                            signal: controller.signal,
                        });
                    } catch (toolError) {
                        console.error('Tool execution failed', toolError);
                        updateMessage(assistantMessage.id, (current) => {
                            const toolCalls = [...(current.toolCalls || [])];
                            const existingIndex = toolCalls.findIndex((call) => call.id === toolId);
                            if (existingIndex >= 0) {
                                toolCalls[existingIndex] = {
                                    ...toolCalls[existingIndex],
                                    status: 'error',
                                    error: toolError instanceof Error ? toolError.message : 'Tool call failed',
                                };
                            }
                            return { toolCalls };
                        });
                    }
                }
            }

            // After the first response, fetch an automatic title suggestion
            if (activeThread?.rootChildren && activeThread.rootChildren.length <= 1 && activeThread.title === 'New Chat') {
                try {
                    const actingMessages = [
                        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
                        ...historyChain.map(({ role, content }) => ({ role, content })),
                        { role: 'user' as const, content },
                        { role: 'assistant' as const, content: (allMessages[assistantMessage.id]?.content ?? '') },
                    ];
                    const title = await getTitleSuggestion(actingMessages);
                    if (title) {
                        updateThreadTitle(activeThreadId!, title);
                    }
                } catch (err) {
                    console.warn('Failed to fetch title suggestion:', err);
                }
            }

        } catch (error) {
            const errorMessage = `Error: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`;
            updateMessage(assistantMessage.id, { content: errorMessage });
        } finally {
            setIsLoading(false);
            setStreamingMessageId(null);
            abortControllerRef.current = null;
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

    const handleNavigateBranch = (parentId: string | null, direction: 'prev' | 'next') => {
        if (!activeThreadId || !activeThread) return;

        if (parentId === null) {
            const siblings = activeThread.rootChildren;
            if (!siblings || siblings.length === 0) return;
            const selectedRoot = activeThread.selectedRootChild ?? siblings[siblings.length - 1];
            let index = siblings.indexOf(selectedRoot);
            if (index === -1) index = siblings.length - 1;

            if (direction === 'prev') {
                index = (index - 1 + siblings.length) % siblings.length;
            } else {
                index = (index + 1) % siblings.length;
            }

            const targetChild = siblings[index];
            selectBranch(activeThreadId, null, targetChild);
            return;
        }

        const parentMessage = allMessages[parentId];
        if (!parentMessage || parentMessage.children.length === 0) return;

        const siblings = parentMessage.children;
        const selectedChildId = activeThread.selectedChildByMessageId[parentId] ?? siblings[siblings.length - 1];
        let index = siblings.indexOf(selectedChildId);
        if (index === -1) {
            index = siblings.length - 1;
        }

        if (direction === 'prev') {
            index = (index - 1 + siblings.length) % siblings.length;
        } else {
            index = (index + 1) % siblings.length;
        }

        const targetChild = siblings[index];
        selectBranch(activeThreadId, parentId, targetChild);
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
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
                        let branchInfo;
                        if (msg.parentId) {
                            const parentMessage = allMessages[msg.parentId];
                            if (parentMessage && parentMessage.children.length > 1) {
                                const siblings = parentMessage.children;
                                const index = siblings.indexOf(msg.id);
                                branchInfo = {
                                    index: index >= 0 ? index : 0,
                                    total: siblings.length,
                                    onPrev: () => handleNavigateBranch(msg.parentId!, 'prev'),
                                    onNext: () => handleNavigateBranch(msg.parentId!, 'next'),
                                };
                            }
                        } else if (activeThread?.rootChildren && activeThread.rootChildren.length > 1) {
                            const siblings = activeThread.rootChildren;
                            const index = siblings.indexOf(msg.id);
                            branchInfo = {
                                index: index >= 0 ? index : 0,
                                total: siblings.length,
                                onPrev: () => handleNavigateBranch(null, 'prev'),
                                onNext: () => handleNavigateBranch(null, 'next'),
                            };
                        }

                        return (
                            <ChatMessage
                                key={msg.id}
                                message={msg}
                                onSave={handleFork}
                                isStreaming={msg.id === streamingMessageId}
                                branchInfo={branchInfo}
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
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setInstructionDialogOpen(true)}
                        className="h-10 w-10 p-0"
                        title="Manage system instructions"
                    >
                        <Cog className="h-4 w-4" />
                    </Button>
                    {isLoading ? (
                        <Button type="button" onClick={handleCancel} variant="destructive" className="h-10 w-10 p-0">
                            <Square className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button type="submit" disabled={!input.trim()} className="h-10 w-10 p-0">
                            <Send className="h-4 w-4" />
                        </Button>
                    )}
                </form>
            </div>
            <SystemInstructionDialog open={isInstructionDialogOpen} onOpenChange={setInstructionDialogOpen} />
        </div>
    );
};

export default ChatPane;
