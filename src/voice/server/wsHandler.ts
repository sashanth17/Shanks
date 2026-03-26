import type { WebSocket as WsSocket } from 'ws';
import * as vscode from 'vscode';
import { OpenRouterService } from '../../services/openrouter';
import { IAIClient } from '../../types';
import { Logger } from '../../extension/general_utils/logger';

const WS_OPEN = 1; // WebSocket.OPEN

/**
 * WsHandler
 *
 * Routes WebSocket messages between the Voice UI (localhost) and the Extension Host.
 *
 * Inbound from Voice UI:
 *   REQUEST_DEEPGRAM_KEY  → look up key, prompt if missing, send back
 *   TRANSCRIPT            → run AI, stream response back
 *
 * Outbound to Voice UI:
 *   DEEPGRAM_KEY          → apiKey
 *   AI_START              → id
 *   AI_CHUNK              → id, chunk
 *   AI_END                → id, fullText
 *   ERROR                 → message
 */
export class WsHandler {
    constructor(
        private readonly _onTranscript: (text: string, isFinal: boolean) => void,
        private readonly _onStateChange: (state: string) => void
    ) {}

    public async handle(ws: WsSocket, raw: string): Promise<void> {
        let msg: any;
        try { msg = JSON.parse(raw); } catch { return; }

        Logger.debug(`[WsHandler] Received from voice UI: ${msg.type}`);

        switch (msg.type) {
            case 'REQUEST_DEEPGRAM_KEY':
                await this._sendDeepgramKey(ws);
                break;
            case 'TRANSCRIPT':
                this._onTranscript(msg.text as string, !!msg.isFinal);
                break;
            case 'STATE_CHANGE':
                this._onStateChange(msg.state as string);
                break;
        }
    }

    private _send(ws: WsSocket, payload: object): void {
        if (ws.readyState === WS_OPEN) {
            ws.send(JSON.stringify(payload));
        }
    }

    private async _sendDeepgramKey(ws: WsSocket): Promise<void> {
        let apiKey = vscode.workspace.getConfiguration('shanks').get<string>('deepgramApiKey');

        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your Deepgram API Key for voice (STT & TTS)',
                placeHolder: 'dg-...',
                ignoreFocusOut: true,
                password: true,
            });
            if (apiKey) {
                await vscode.workspace.getConfiguration('shanks').update('deepgramApiKey', apiKey, vscode.ConfigurationTarget.Global);
                Logger.info('[WsHandler] Deepgram API key saved.');
            } else {
                this._send(ws, { type: 'ERROR', message: 'Deepgram API Key is required for voice features.' });
                return;
            }
        }

        this._send(ws, { type: 'DEEPGRAM_KEY', apiKey });
        Logger.info('[WsHandler] Deepgram API key sent to voice UI.');
    }
}
