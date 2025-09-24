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
    onStream: (chunk: string) => void
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
                model: "google/gemini-pro-2.5",
                messages: messages,
                stream: true, // Enable streaming
            }),
        });

        if (!response.ok || !response.body) {
            const errorBody = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

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
                    const content = parsed.choices[0]?.delta?.content;
                    if (content) {
                        fullResponse += content;
                        onStream(fullResponse); // Send the accumulating full response
                    }
                } catch (e) {
                    console.error("Error parsing stream chunk:", e);
                }
            }
        }
        
        return fullResponse;

    } catch (error) {
        console.error("Error fetching from OpenRouter:", error);
        throw error;
    }
};
