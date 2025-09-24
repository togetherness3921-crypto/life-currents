// This service will handle API calls to OpenRouter

const OPEN_ROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

type ToolContentBlock = { type: 'text'; text: string } | { type: string; [key: string]: unknown };

export type ApiMessage =
    | { role: 'system'; content: string }
    | { role: 'user'; content: string }
    | { role: 'assistant'; content: string }
    | { role: 'tool'; tool_call_id: string; name: string; content: string | ToolContentBlock[] };

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
    onStream?: (update: { content?: string; reasoning?: string; toolCall?: ToolCallDelta }) => void;
    signal?: AbortSignal;
    stream?: boolean;
}

export interface GeminiResponse {
    content: string;
    raw: unknown;
}

export const getGeminiResponse = async (
    messages: ApiMessage[],
    {
        onStream,
        signal,
        tools,
        stream = true,
    }: StreamCallbacks & { tools?: ApiToolDefinition[] }
): Promise<GeminiResponse> => {
    if (!OPEN_ROUTER_API_KEY) {
        throw new Error("VITE_OPENROUTER_API_KEY is not set in .env file");
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-pro",
                messages,
                stream,
                tools,
            }),
            signal,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        if (!stream) {
            const data = await response.json();
            const message = data.choices?.[0]?.message;
            let content = '';
            const messageContent = message?.content;
            if (typeof messageContent === 'string') {
                content = messageContent;
            } else if (Array.isArray(messageContent)) {
                const textPieces = messageContent
                    .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
                    .map((block: any) => block.text);
                content = textPieces.join('\n');
            }
            return { content, raw: data };
        }

        if (!response.body) {
            throw new Error('API response missing body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";
        let reasoningBuffer = "";
        let rawResponse: unknown = null;

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
                    rawResponse = parsed;
                    const delta = parsed.choices?.[0]?.delta;
                    const content = delta?.content;
                    const reasoning = delta?.reasoning;
                    const toolCallDelta = delta?.tool_calls?.[0];

                    if (content) {
                        fullResponse += content;
                        onStream?.({ content: fullResponse });
                    }
                    if (reasoning) {
                        reasoningBuffer += reasoning;
                        onStream?.({ reasoning: reasoningBuffer });
                    }
                    if (toolCallDelta) {
                        let status: ToolCallDelta['status'] = 'start';
                        if (toolCallDelta.function?.arguments) {
                            status = 'arguments';
                        }
                        if (toolCallDelta.status === 'finished') {
                            status = 'finish';
                        }
                        const toolUpdate: ToolCallDelta = {
                            id: toolCallDelta.id,
                            name: toolCallDelta.function?.name,
                            arguments: toolCallDelta.function?.arguments,
                            index: toolCallDelta.index,
                            status,
                        };
                        onStream?.({ toolCall: toolUpdate });
                    }
                } catch (e) {
                    console.error("Error parsing stream chunk:", e);
                }
            }
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

export const getTitleSuggestion = async (messages: ApiMessage[]): Promise<string | null> => {
    if (!OPEN_ROUTER_API_KEY) {
        throw new Error("VITE_OPENROUTER_API_KEY is not set in .env file");
    }

    const conversationText = messages
        .map((m) => m.role === 'tool' ? `${m.role.toUpperCase()}: ${m.name}` : `${m.role.toUpperCase()}: ${'content' in m ? m.content : ''}`)
        .join('\n');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPEN_ROUTER_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-pro",
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
