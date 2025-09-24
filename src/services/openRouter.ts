// This service will handle API calls to OpenRouter

const OPEN_ROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Define the structure for messages sent to the API
interface ApiMessage {
    role: 'user' | 'assistant';
    content: string;
}

export const getGeminiResponse = async (messages: ApiMessage[]) => {
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
                model: "google/gemini-pro-2.5", // Using Gemini 2.5 Pro as requested
                messages: messages,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
        }

        const data = await response.json();
        const assistantMessage = data.choices[0]?.message?.content;

        if (!assistantMessage) {
            throw new Error("Invalid response structure from API");
        }

        return assistantMessage;

    } catch (error) {
        console.error("Error fetching from OpenRouter:", error);
        throw error;
    }
};
