import { IAIClient, ChatMessage } from "../types";
import * as net from "net";
import * as vscode from "vscode";
import { PythonServerManager } from "../extension/pythonServer";

export class OpenRouterService implements IAIClient {
    private _apiKey: string;
    private _model: string;
    private _socket: net.Socket | null = null;
    private _connectingPromise: Promise<void> | null = null;

    constructor(apiKey: string, model: string = "google/gemini-2.0-flash-001") {
        this._apiKey = apiKey;
        this._model = model;
    }

    private async _connectSocket(): Promise<void> {
        if (this._connectingPromise) return this._connectingPromise;
        
        this._connectingPromise = new Promise(async (resolve, reject) => {
            try {
                this._socket = await PythonServerManager.getInstance().createSocket();
                console.log(`Connected to Python OpenRouter service`);
                
                this._socket.on('error', (err) => {
                    console.error("Socket error mapping openrouter python service:", err);
                });
                resolve();
            } catch (err) {
                console.error("Failed to connect to Python server:", err);
                reject(err);
            }
        });
        
        return this._connectingPromise;
    }

    public async generateResponse(prompt: string, history: ChatMessage[]): Promise<string> {
        return this.generateStreamingResponse(prompt, history, () => { });
    }

    public async generateStreamingResponse(prompt: string, history: ChatMessage[], onChunk: (chunk: string) => void): Promise<string> {
        if (!this._socket || this._socket.destroyed || this._socket.closed) {
            await this._connectSocket();
        }

        if (!this._socket) {
            throw new Error("Python OpenRouter socket could not be established");
        }

        return new Promise((resolve, reject) => {
            let fullText = "";

            const payload = JSON.stringify({
                apiKey: this._apiKey,
                model: this._model,
                prompt: prompt,
                history: history
            }) + "\n";

            let dataBuffer = "";

            const dataListener = (data: Buffer) => {
                dataBuffer += data.toString();
                let boundary = dataBuffer.indexOf("\n");
                
                while (boundary !== -1) {
                    const line = dataBuffer.slice(0, boundary).trim();
                    dataBuffer = dataBuffer.slice(boundary + 1);
                    boundary = dataBuffer.indexOf("\n");

                    if (!line) continue;

                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.error) {
                            cleanup();
                            reject(new Error(parsed.error));
                            return;
                        } else if (parsed.done) {
                            cleanup();
                            resolve(fullText);
                            return;
                        } else if (parsed.chunk) {
                            fullText += parsed.chunk;
                            onChunk(parsed.chunk);
                        }
                    } catch (e) {
                        console.error("Failed to parse socket chunk:", e);
                    }
                }
            };

            const cleanup = () => {
                this._socket?.removeListener('data', dataListener);
                this._socket?.removeListener('error', errorListener);
            };

            const errorListener = (err: any) => {
                cleanup();
                reject(err);
            };

            this._socket!.on('data', dataListener);
            this._socket!.on('error', errorListener);

            this._socket!.write(payload);
        });
    }

    public dispose() {
        if (this._socket) {
            this._socket.destroy();
            this._socket = null;
        }
        this._connectingPromise = null;
    }
}
