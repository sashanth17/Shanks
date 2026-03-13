import * as vscode from 'vscode';
import { OpenRouterService } from '../services/openrouter';
import { IAIClient, Message, ChatMessage, WebviewMessage, ExtensionMessage } from '../types';
import { Logger } from './logger';
import { VoiceServer } from './voiceServer';

export class ShanksViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'shanks.chatView';
    private _view?: vscode.WebviewView;
    private _aiClient?: IAIClient;
    private _history: ChatMessage[] = [];
    private _voiceServer?: VoiceServer;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public setVoiceServer(server: VoiceServer) {
        this._voiceServer = server;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        Logger.info('[ShanksViewProvider] Webview view resolved.');

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data: WebviewMessage) => {
            Logger.debug(`[ShanksViewProvider] Received message from webview: ${data.type}`);
            switch (data.type) {
                case 'USER_MESSAGE':
                    await this._handleMessage(data.payload);
                    break;
                case 'VOICE_TRANSCRIPT':
                    await this._handleMessage({
                        id: Date.now().toString(),
                        role: 'user',
                        text: data.text,
                        timestamp: Date.now()
                    });
                    break;
                case 'MODE_CHANGE':
                    Logger.info(`[ShanksViewProvider] Mode changed to: ${data.mode}`);
                    break;
                case 'REQUEST_VOICE_URL':
                    this._sendVoiceUrl();
                    break;
                case 'REQUEST_DEEPGRAM_KEY':
                    await this._handleDeepgramKeyRequest();
                    break;
            }
        });
    }

    public handleTranscript(text: string, isFinal: boolean) {
        this._postMessage({ type: 'VOICE_TRANSCRIPT', text });
        
        if (isFinal) {
            this._handleMessage({
                id: Date.now().toString(),
                role: 'user',
                text,
                timestamp: Date.now()
            });
        }
    }

    public handleVoiceState(state: string) {
        this._postMessage({ type: 'VOICE_STATE', state: state as any });
    }

    private _sendVoiceUrl(): void {
        const url = this._voiceServer?.url;
        if (!url) return;
        Logger.info(`[ShanksViewProvider] Opening voice UI at: ${url}`);
        vscode.env.openExternal(vscode.Uri.parse(url));
        this._postMessage({ type: 'VOICE_URL', url });
    }

    private async _handleDeepgramKeyRequest() {
        if (!this._view) return;
        let apiKey = vscode.workspace.getConfiguration('shanks').get<string>('deepgramApiKey');

        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                prompt: 'Please enter your Deepgram API Key for real-time STT & TTS',
                placeHolder: 'Your Deepgram API key...',
                ignoreFocusOut: true,
                password: true
            });

            if (apiKey) {
                await vscode.workspace.getConfiguration('shanks').update('deepgramApiKey', apiKey, vscode.ConfigurationTarget.Global);
                Logger.info('[ShanksViewProvider] Deepgram API key saved to global settings.');
            } else {
                this._postMessage({ type: 'ERROR', message: 'Deepgram API Key is required for voice features.' });
                return;
            }
        }

        Logger.info('[ShanksViewProvider] Sending Deepgram API key to webview.');
        this._postMessage({ type: 'DEEPGRAM_API_KEY', apiKey });
    }

    private async _handleMessage(userMessage: Message) {
        if (!this._view) return;

        let apiKey = vscode.workspace.getConfiguration('shanks').get<string>('openRouterApiKey');

        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                prompt: 'Please enter your OpenRouter API Key',
                placeHolder: 'sk-or-v1-...',
                ignoreFocusOut: true,
                password: true
            });

            if (apiKey) {
                await vscode.workspace.getConfiguration('shanks').update('openRouterApiKey', apiKey, vscode.ConfigurationTarget.Global);
                Logger.info('[ShanksViewProvider] API key saved to global settings.');
            } else {
                this._postMessage({ type: 'ERROR', message: 'OpenRouter API Key is required.' });
                return;
            }
        }

        if (!this._aiClient) {
            const model = vscode.workspace.getConfiguration('shanks').get<string>('openRouterModel') || 'openai/gpt-4o-mini';
            this._aiClient = new OpenRouterService(apiKey, model);
            Logger.info(`[ShanksViewProvider] AI client initialized with model: ${model}`);
        }

        try {
            const assistantMessageId = Date.now().toString();
            Logger.info(`[ShanksViewProvider] Sending message to AI (id=${assistantMessageId}): "${userMessage.text.slice(0, 60)}..."`);

            this._postMessage({ type: 'AI_RESPONSE_START', id: assistantMessageId });
            this._voiceServer?.broadcast({ type: 'AI_START', id: assistantMessageId });

            const fullText = await this._aiClient.generateStreamingResponse(
                userMessage.text,
                this._history,
                (chunk) => {
                    this._postMessage({ type: 'AI_RESPONSE_CHUNK', id: assistantMessageId, chunk });
                    this._voiceServer?.broadcast({ type: 'AI_CHUNK', id: assistantMessageId, chunk });
                }
            );

            this._history.push({ role: 'user', content: userMessage.text });
            this._history.push({ role: 'assistant', content: fullText });

            Logger.info(`[ShanksViewProvider] AI response complete (id=${assistantMessageId}), ${fullText.length} chars.`);
            this._postMessage({ type: 'AI_RESPONSE_END', id: assistantMessageId, fullText });
            this._voiceServer?.broadcast({ type: 'AI_END', id: assistantMessageId, fullText });

        } catch (error: any) {
            Logger.error('[ShanksViewProvider] AI request failed.', error);
            this._postMessage({ type: 'ERROR', message: error.message || 'Failed to get response from AI.' });
        }
    }

    /** Type-safe helper to post messages to the webview. */
    private _postMessage(message: ExtensionMessage): void {
        this._view?.webview.postMessage(message);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'));
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <link href="${styleUri}" rel="stylesheet">
                <title>Shanks Assistant</title>
            </head>
            <body>
                <div id="root"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
