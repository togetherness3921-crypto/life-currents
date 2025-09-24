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
    onStream?: (chunk: string) => void
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
                'Accept': 'text/event-stream',
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-pro",
                messages: messages,
                stream: true,
            }),
        });

        if (!response.ok || !response.body) {
            const errorBody = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete lines only
            let lineBreakIndex;
            while ((lineBreakIndex = buffer.indexOf('\n')) !== -1) {
                const rawLine = buffer.slice(0, lineBreakIndex).trim();
                buffer = buffer.slice(lineBreakIndex + 1);

                if (!rawLine || !rawLine.startsWith('data:')) continue;
                const jsonStr = rawLine.slice(5).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(jsonStr);
                    // OpenAI-compatible streaming shape
                    let delta = parsed?.choices?.[0]?.delta?.content;
                    // Some providers send { message: { content } }
                    if (!delta && parsed?.message?.content) delta = parsed.message.content;
                    // Fallback to choices[0].message.content on final chunk
                    if (!delta && parsed?.choices?.[0]?.message?.content) delta = parsed.choices[0].message.content;

                    if (typeof delta === 'string' && delta.length > 0) {
                        fullResponse += delta;
                        if (onStream) onStream(fullResponse);
                    }
                } catch (e) {
                    // Ignore malformed partial lines
                    // console.error('Stream parse error', e);
                }
            }
        }

        // Flush any remaining buffered JSON
        const trailing = buffer.trim();
        if (trailing.startsWith('data:')) {
            const jsonStr = trailing.slice(5).trim();
            if (jsonStr && jsonStr !== '[DONE]') {
                try {
                    const parsed = JSON.parse(jsonStr);
                    let delta = parsed?.choices?.[0]?.delta?.content
                        || parsed?.message?.content
                        || parsed?.choices?.[0]?.message?.content;
                    if (typeof delta === 'string' && delta.length > 0) {
                        fullResponse += delta;
                        if (onStream) onStream(fullResponse);
                    }
                } catch { }
            }
        }

        return fullResponse;

    } catch (error) {
        console.error("Error fetching from OpenRouter:", error);
        throw error;
    }
};
