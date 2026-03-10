import { GoogleGenerativeAI } from "@google/generative-ai";
import { IAIClient, ChatMessage } from "../types";

export class GeminiService implements IAIClient {
    private _genAI: GoogleGenerativeAI;
    private _model: any;

    constructor(apiKey: string) {
        this._genAI = new GoogleGenerativeAI(apiKey);
        this._model = this._genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    }

    public async generateResponse(prompt: string, history: ChatMessage[] = []): Promise<string> {
        return this.generateStreamingResponse(prompt, history, () => { });
    }

    public async generateStreamingResponse(prompt: string, history: ChatMessage[] = [], onChunk: (chunk: string) => void): Promise<string> {
        try {
            const chat = this._model.startChat({
                history: [
                    {
                        role: "user",
                        parts: [{ text: "You are Shanks, a helpful AI coding assistant inside VS Code. Provide concise and helpful answers for developers." }],
                    },
                    {
                        role: "model",
                        parts: [{ text: "Understood. I am Shanks, your AI assistant. How can I help you today?" }],
                    },
                    ...history.map(msg => ({
                        role: msg.role === 'user' ? 'user' : 'model',
                        parts: [{ text: msg.content }]
                    }))
                ],
            });

            const result = await chat.sendMessageStream(prompt);
            let fullText = "";
            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                fullText += chunkText;
                onChunk(chunkText);
            }
            return fullText;
        } catch (error) {
            console.error("Gemini API Error:", error);
            throw error;
        }
    }
}
