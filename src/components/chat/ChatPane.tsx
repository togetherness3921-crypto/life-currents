import React, { useState, FormEvent, useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import {
    getGeminiResponse,
    getTitleSuggestion,
    getToolIntent,
    type ApiToolDefinition,
    type ApiToolCall,
} from '@/services/openRouter';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Send, Square, PlusCircle, Cog } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { useChatContext } from '@/hooks/useChat';
import { useSystemInstructions } from '@/hooks/useSystemInstructions';
import SettingsDialog from './SettingsDialog';
import { useMcp } from '@/hooks/useMcp';
import useModelSelection from '@/hooks/useModelSelection';
import { useConversationContext } from '@/hooks/useConversationContext';
import { cn } from '@/lib/utils';

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
        updateDraft,
        clearDraft,
        drafts,
        messages: allMessages // get all messages for parent lookup
    } = useChatContext();

    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
    const [isSettingsDialogOpen, setSettingsDialogOpen] = useState(false);
    const [isInputExpanded, setIsInputExpanded] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const { activeInstruction } = useSystemInstructions();
    const { tools: availableTools, callTool } = useMcp();
    const { selectedModel, recordModelUsage, getToolIntentCheck } = useModelSelection();
    const { applyContextToMessages, transforms } = useConversationContext();

    const activeThread = activeThreadId ? getThread(activeThreadId) : null;
    const selectedLeafId = activeThread?.leafMessageId || activeThread?.selectedRootChild || null;
    const messages = getMessageChain(selectedLeafId);

    useEffect(() => {
        if (!activeThreadId) {
            setInput('');
            return;
        }
        setInput(drafts[activeThreadId] ?? '');
    }, [activeThreadId, drafts]);

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
        console.log('[ChatPane] submitMessage called with:', { content, threadId, parentId });

        // Build payload for API using existing conversation + new user input
        const historyChain = parentId ? applyContextToMessages(getMessageChain(parentId)) : [];
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
        console.log('[ChatPane] Sending payload to API:', apiMessages);
        console.log('[ChatPane][MCP] Available tools:', availableTools);

        let toolsForInitialCall: ApiToolDefinition[] | undefined =
            toolDefinitions.length > 0 ? toolDefinitions : undefined;

        if (toolsForInitialCall && getToolIntentCheck(selectedModel.id)) {
            try {
                const intent = await getToolIntent(content);
                console.log('[ChatPane] Tool intent classification:', intent);
                if (intent === 'CONVERSATION') {
                    toolsForInitialCall = undefined;
                }
            } catch (intentError) {
                console.warn('[ChatPane] Tool intent classification failed. Falling back to tool-enabled request.', intentError);
            }
        }

        // Add user message to state for UI
        const userMessage = addMessage(threadId, { role: 'user', content, parentId });
        clearDraft(threadId);
        setInput('');

        // Add a blank assistant message to begin streaming
        const assistantMessage = addMessage(threadId, { role: 'assistant', content: '', parentId: userMessage.id, toolCalls: [] });
        setStreamingMessageId(assistantMessage.id);

        let finalizeCalled = false;
        const finalize = () => {
            if (finalizeCalled) return;
            finalizeCalled = true;
            setIsLoading(false);
            setStreamingMessageId(null);
            abortControllerRef.current = null;
        };

        try {
            const controller = new AbortController();
            abortControllerRef.current = controller;

            const { raw } = await getGeminiResponse(apiMessages, {
                onStream: (update) => {
                    console.log('[ChatPane][Streaming update]', update);
                    if (update.content !== undefined) {
                        updateMessage(assistantMessage.id, { content: update.content });
                    }
                    if (update.reasoning !== undefined) {
                        updateMessage(assistantMessage.id, { thinking: update.reasoning });
                    }
                    if (update.toolCall) {
                        console.log('[ChatPane][Tool update detected]', update.toolCall);
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
                tools: toolsForInitialCall,
                model: selectedModel.id,
                transforms: transforms.length > 0 ? transforms : undefined,
            });

            console.log('[ChatPane][Raw Gemini response]', raw);
            if (!raw) {
                finalize();
                return;
            }
            const toolCallRequests = raw?.choices?.[0]?.message?.tool_calls;
            if (toolCallRequests && Array.isArray(toolCallRequests) && toolCallRequests.length > 0) {
                console.log('[ChatPane][MCP] Processing', toolCallRequests.length, 'tool calls');

                // Collect all tool call messages and tool result messages
                const allToolCallMessages: ApiToolCall[] = [];
                const allToolResultMessages: Array<{ role: 'tool'; tool_call_id: string; content: string }> = [];

                // Execute all tool calls
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
                        if (!toolName) {
                            throw new Error('Tool call did not include a tool name.');
                        }

                        console.log('[ChatPane][MCP] Calling tool', toolName, 'with args', toolArgs);
                        const toolResult = await callTool(toolName, toolArgs);
                        console.log('[ChatPane][MCP] Tool result', toolResult);
                        const toolContent = typeof toolResult?.content === 'string'
                            ? toolResult.content
                            : JSON.stringify(toolResult?.content ?? '', null, 2);

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

                        // Collect tool call message for this tool
                        allToolCallMessages.push({
                            id: toolId,
                            type: 'function',
                            function: {
                                name: toolName,
                                arguments: toolCallRequest.function?.arguments ?? JSON.stringify(toolArgs),
                            },
                        });

                        // Collect tool result message for this tool
                        allToolResultMessages.push({
                            role: 'tool' as const,
                            tool_call_id: toolId,
                            content: toolContent,
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

                        // Still add the error as a tool result
                        allToolCallMessages.push({
                            id: toolId,
                            type: 'function',
                            function: {
                                name: toolName ?? toolId,
                                arguments: toolCallRequest.function?.arguments ?? '{}',
                            },
                        });
                        allToolResultMessages.push({
                            role: 'tool' as const,
                            tool_call_id: toolId,
                            content: `Error: ${toolError instanceof Error ? toolError.message : 'Tool call failed'}`,
                        });
                    }
                }

                // Now send ONE follow-up request with ALL tool calls and results
                if (allToolCallMessages.length > 0) {
                    console.log('[ChatPane][Follow-up] Sending follow-up request with', allToolCallMessages.length, 'tool results');

                    const followUpMessages = [
                        ...apiMessages,
                        {
                            role: 'assistant' as const,
                            content: '',
                            tool_calls: allToolCallMessages,
                        },
                        ...allToolResultMessages,
                    ];

                    console.log('[ChatPane][Follow-up] Messages payload:', JSON.stringify(followUpMessages, null, 2));

                    try {
                        const followUpResult = await getGeminiResponse(followUpMessages, {
                            onStream: (update) => {
                                console.log('[ChatPane][Follow-up streaming update]', update);
                                if (update.content !== undefined) {
                                    updateMessage(assistantMessage.id, { content: update.content });
                                }
                                if (update.reasoning !== undefined) {
                                    updateMessage(assistantMessage.id, { thinking: update.reasoning });
                                }
                            },
                            signal: controller.signal,
                            tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
                            model: selectedModel.id,
                            transforms: transforms.length > 0 ? transforms : undefined,
                        });
                        console.log('[ChatPane][Follow-up] Follow-up request completed', followUpResult);
                    } catch (followUpError) {
                        console.error('[ChatPane][Follow-up] Follow-up request failed:', followUpError);
                        const errorMessage = `Follow-up request failed: ${followUpError instanceof Error ? followUpError.message : 'Unknown error'}`;
                        updateMessage(assistantMessage.id, { content: errorMessage });
                    }
                }
            }

            finalize();

            // After the first response, fetch an automatic title suggestion asynchronously
            if (activeThread?.rootChildren && activeThread.rootChildren.length <= 1 && activeThread.title === 'New Chat') {
                void (async () => {
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
                })();
            }

        } catch (error) {
            const errorMessage = `Error: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`;
            updateMessage(assistantMessage.id, { content: errorMessage });
            finalize();
        } finally {
            finalize();
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
        setIsInputExpanded(false);

        const currentChain = getMessageChain(activeThread?.leafMessageId || null);
        const parentId = currentChain.length > 0 ? currentChain[currentChain.length - 1].id : null;

        recordModelUsage(selectedModel.id);
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
        <div className="relative flex h-full flex-col bg-background">
            <ScrollArea
                className="flex-1 p-4"
                ref={scrollAreaRef}
                onMouseDown={() => {
                    if (isInputExpanded) {
                        setIsInputExpanded(false);
                    }
                }}
            >
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
            <div
                className={cn(
                    'border-t bg-background p-4 transition-all duration-300 ease-in-out',
                    isInputExpanded ? 'absolute bottom-0 left-0 right-0 z-20 h-1/2 shadow-2xl' : ''
                )}
                onFocusCapture={() => setIsInputExpanded(true)}
                onBlurCapture={(event) => {
                    const relatedTarget = event.relatedTarget as Node | null;
                    if (!event.currentTarget.contains(relatedTarget)) {
                        setIsInputExpanded(false);
                    }
                }}
            >
                <form
                    ref={formRef}
                    onSubmit={handleSubmit}
                    className={cn('flex w-full gap-3', isInputExpanded ? 'h-full flex-col' : 'items-center')}
                >
                    <Textarea
                        value={input}
                        onChange={(e) => {
                            let threadId = activeThreadId;
                            if (!threadId) {
                                threadId = createThread();
                            }
                            const value = e.target.value;
                            setInput(value);
                            if (threadId) {
                                updateDraft(threadId, value);
                            }
                        }}
                        placeholder="Ask anything..."
                        disabled={isLoading}
                        rows={isInputExpanded ? 8 : 1}
                        className={cn(
                            'min-h-[44px] w-full resize-none border bg-background text-sm shadow-sm',
                            isInputExpanded ? 'flex-1 text-base' : ''
                        )}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                                const hasModifier = event.metaKey || event.ctrlKey;
                                if (!isInputExpanded || hasModifier) {
                                    event.preventDefault();
                                    formRef.current?.requestSubmit();
                                }
                            }
                        }}
                    />
                    <div
                        className={cn(
                            'flex items-center gap-2',
                            isInputExpanded ? 'justify-end' : ''
                        )}
                    >
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setSettingsDialogOpen(true)}
                            className="h-10 w-10 p-0"
                            title="Open settings"
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
                    </div>
                </form>
            </div>
            <SettingsDialog open={isSettingsDialogOpen} onOpenChange={setSettingsDialogOpen} />
        </div>
    );
};

export default ChatPane;
