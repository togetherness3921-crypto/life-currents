// This service will handle API calls to OpenRouter

import { DEFAULT_MODEL_ID } from '@/hooks/modelSelectionProviderContext';

const OPEN_ROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODELS_API_URL = "https://openrouter.ai/api/v1/models";

export interface ApiToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export type ApiMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string; tool_calls?: ApiToolCall[] }
    | { role: 'tool'; tool_call_id: string; content: string };

export interface ApiToolDefinition {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
    };
}

export interface ToolCallDelta {
    id: string;
    name?: string;
    arguments?: string;
    index?: number;
    status: 'start' | 'arguments' | 'finish';
}

interface StreamCallbacks {
    onStream: (update: { content?: string; reasoning?: string; toolCall?: ToolCallDelta }) => void;
    signal?: AbortSignal;
}

interface GetGeminiResponseOptions extends StreamCallbacks {
    tools?: ApiToolDefinition[];
    model?: string;
}

export interface OpenRouterModel {
    id: string;
    name?: string;
    description?: string;
    pricing?: {
        prompt?: string;
        completion?: string;
    };
    context_length?: number;
    architecture?: Record<string, unknown>;
}

export const fetchOpenRouterModels = async ({ signal }: { signal?: AbortSignal } = {}): Promise<OpenRouterModel[]> => {
    if (!OPEN_ROUTER_API_KEY) {
        throw new Error("VITE_OPENROUTER_API_KEY is not set in .env file");
    }

    const response = await fetch(MODELS_API_URL, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${OPEN_ROUTER_API_KEY}`,
        },
        signal,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Failed to load models: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    if (Array.isArray(data?.data)) {
        return data.data as OpenRouterModel[];
    }
    throw new Error('Unexpected response when fetching models');
};

export interface GeminiResponse {
    content: string;
    raw: unknown;
}

export const getGeminiResponse = async (
    messages: ApiMessage[],
    { onStream, signal, tools, model }: GetGeminiResponseOptions
): Promise<GeminiResponse> => {
    if (!OPEN_ROUTER_API_KEY) {
        throw new Error("VITE_OPENROUTER_API_KEY is not set in .env file");
    }

    try {
        const resolvedModel = model ?? DEFAULT_MODEL_ID;
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: resolvedModel,
                messages,
                stream: true,
                tools,
                reasoning: {
                    enabled: true,
                    effort: 'high',
                },
            }),
            signal,
        });

        if (!response.ok || !response.body) {
            const errorBody = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";
        let reasoningBuffer = "";
        let rawResponse: any = null;
        const toolCalls: ApiToolCall[] = [];

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

            for (const line of lines) {
                const jsonStr = line.replace('data: ', '');
                if (jsonStr === '[DONE]') {
                    break;
                }
                try {
                    const parsed = JSON.parse(jsonStr);
                    rawResponse = parsed; // This will be the last chunk
                    const delta = parsed.choices?.[0]?.delta;
                    const content = delta?.content;
                    const reasoning = delta?.reasoning;
                    const toolCallDeltas = delta?.tool_calls;

                    if (content) {
                        fullResponse += content;
                        onStream({ content: fullResponse });
                    }
                    if (reasoning) {
                        reasoningBuffer += reasoning;
                        onStream({ reasoning: reasoningBuffer });
                    }
                    if (toolCallDeltas && Array.isArray(toolCallDeltas)) {
                        for (const toolCallDelta of toolCallDeltas) {
                            const existingCallIndex = toolCalls.findIndex(
                                (call) => call.id === toolCallDelta.id
                            );

                            if (existingCallIndex === -1) {
                                // First time seeing this tool call
                                toolCalls.push({
                                    id: toolCallDelta.id,
                                    type: 'function',
                                    function: {
                                        name: toolCallDelta.function?.name || '',
                                        arguments: toolCallDelta.function?.arguments || '',
                                    },
                                });
                            } else {
                                // Subsequent chunk, append arguments
                                if (toolCallDelta.function?.arguments) {
                                    toolCalls[existingCallIndex].function.arguments +=
                                        toolCallDelta.function.arguments;
                                }
                            }
                            const currentCallState = toolCalls[existingCallIndex] ?? toolCalls[toolCalls.length - 1];
                            const toolUpdate: ToolCallDelta = {
                                id: toolCallDelta.id,
                                name: currentCallState.function.name,
                                arguments: currentCallState.function.arguments,
                                index: toolCallDelta.index,
                                status: 'arguments',
                            };
                            onStream({ toolCall: toolUpdate });
                        }
                    }
                } catch (e) {
                    console.error("Error parsing stream chunk:", e);
                }
            }
        }

        // After the loop, assemble the final response object
        if (rawResponse && toolCalls.length > 0) {
            // Reconstruct the response to look like a non-streaming tool call response
            const finalChoice = {
                index: 0,
                message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: toolCalls,
                },
                finish_reason: 'tool_calls',
            };
            rawResponse.choices = [finalChoice];
        }


        return { content: fullResponse, raw: rawResponse };

    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('Streaming request aborted by user.');
            return { content: '', raw: null };
        }
        console.error("Error fetching from OpenRouter:", error);
        throw error;
    }
};

export const getTitleSuggestion = async (
    messages: ApiMessage[],
    options?: { model?: string }
): Promise<string | null> => {
    if (!OPEN_ROUTER_API_KEY) {
        throw new Error("VITE_OPENROUTER_API_KEY is not set in .env file");
    }

    const conversationText = messages
        .map((m) => `${m.role.toUpperCase()}: ${'content' in m ? m.content : ''}`)
        .join('\n');

    try {
        const resolvedModel = options?.model ?? DEFAULT_MODEL_ID;
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: resolvedModel,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a helpful assistant that generates concise, descriptive titles (max 6 words) for chat conversations. Respond with only the title.',
                    },
                    {
                        role: 'user',
                        content: `Conversation:\n${conversationText}\n\nProvide only the title.`,
                    },
                ],
                stream: false,
                reasoning: {
                    enabled: true,
                    effort: 'high',
                },
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();
        const title = data.choices?.[0]?.message?.content?.trim();
        if (!title) return null;
        return title.length > 60 ? title.slice(0, 57) + '...' : title;
    } catch (error) {
        console.error('Title suggestion failed:', error);
        return null;
    }
};
