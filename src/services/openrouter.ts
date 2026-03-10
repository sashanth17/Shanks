import { IAIClient, ChatMessage } from "../types";

export class OpenRouterService implements IAIClient {
    private _apiKey: string;
    private _model: string;

    constructor(apiKey: string, model: string = "google/gemini-2.0-flash-001") {
        this._apiKey = apiKey;
        this._model = model;
    }

    public async generateResponse(prompt: string, history: ChatMessage[]): Promise<string> {
        return this.generateStreamingResponse(prompt, history, () => { });
    }

    public async generateStreamingResponse(prompt: string, history: ChatMessage[], onChunk: (chunk: string) => void): Promise<string> {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this._apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": this._model,
                "stream": true,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are Shanks, a helpful AI coding assistant inside VS Code. Provide concise and helpful answers for developers."
                    },
                    ...history.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenRouter API Error: ${errorData.error?.message || response.statusText}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        if (!reader) throw new Error("Response body is not readable");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n").filter(line => line.trim() !== "");

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    if (data === "[DONE]") break;
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content || "";
                        if (content) {
                            fullText += content;
                            onChunk(content);
                        }
                    } catch (e) {
                        console.error("Error parsing stream chunk", e);
                    }
                }
            }
        }

        return fullText;
    }
}
