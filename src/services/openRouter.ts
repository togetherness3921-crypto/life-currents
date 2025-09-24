// This service will handle API calls to OpenRouter

const OPEN_ROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Define the structure for messages sent to the API
interface ApiMessage {
    role: 'user' | 'assistant';
    content: string;
}

export const getGeminiResponse = async (
    messages: ApiMessage[],
    {
        onStream,
        signal,
    }: {
        onStream: (update: { content?: string; reasoning?: string }) => void;
        signal?: AbortSignal;
    }
): Promise<string> => {
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
                model: "google/gemini-2.5-pro", // Using Gemini 2.5 Pro as requested
                messages: messages,
                stream: true, // Enable streaming
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

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            console.log('[API Service] Received Raw Chunk:', chunk); // LOG 1: Raw data from stream

            const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

            for (const line of lines) {
                const jsonStr = line.replace('data: ', '');
                if (jsonStr === '[DONE]') {
                    break;
                }
                try {
                    const parsed = JSON.parse(jsonStr);
                    const content = parsed.choices[0]?.delta?.content;
                    const reasoning = parsed.choices[0]?.delta?.reasoning;
                    if (content) {
                        fullResponse += content;
                        console.log('[API Service] Parsed Content:', content); // LOG 2: Parsed token
                        console.log('[API Service] Calling onStream with full response:', fullResponse); // LOG 3: Data sent to UI
                        onStream({ content: fullResponse });
                    }
                    if (reasoning) {
                        reasoningBuffer += reasoning;
                        console.log('[API Service] Parsed Reasoning:', reasoning);
                        onStream({ reasoning: reasoningBuffer });
                    }
                } catch (e) {
                    console.error("Error parsing stream chunk:", e);
                }
            }
        }

        return fullResponse;

    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('Streaming request aborted by user.');
            return '';
        }
        console.error("Error fetching from OpenRouter:", error);
        throw error;
    }
};

export const getTitleSuggestion = async (messages: ApiMessage[]): Promise<string | null> => {
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
