import { DeepgramStreamingSTT } from '../voice/deepgramSTT';
import { DeepgramStreamingTTS } from '../voice/deepgramTTS';
import { ISpeechSTT, ISpeechTTS } from '../voice/interfaces';

/** Current state of the voice pipeline. */
export type VoiceState = 'idle' | 'listening' | 'ai_processing' | 'speaking';

export interface VoiceControllerCallbacks {
    /** Called when a final transcript is received → the app should send this to AI. */
    onFinalTranscript: (text: string) => void;
    /** Called when a partial (interim) transcript arrives → show as ghost text. */
    onPartialTranscript: (text: string) => void;
    /** Called when the voice state changes (for UI updates). */
    onStateChange: (state: VoiceState) => void;
    /** Called on unrecoverable errors. */
    onError: (message: string) => void;
}

/**
 * VoiceController
 *
 * Coordinates the full voice pipeline inside the Webview:
 *
 *   Mic → DeepgramSTT → transcript → AI (via vscode.postMessage)
 *                                   ↓
 *   Speaker ← DeepgramTTS ← AI response
 *
 * The controller manages state transitions to prevent overlapping operations.
 */
export class VoiceController {
    private _stt: ISpeechSTT;
    private _tts: ISpeechTTS;
    private _callbacks: VoiceControllerCallbacks;
    private _state: VoiceState = 'idle';
    private _active = false; // True when the user has enabled voice mode

    constructor(apiKey: string, callbacks: VoiceControllerCallbacks) {
        this._stt = new DeepgramStreamingSTT(apiKey);
        this._tts = new DeepgramStreamingTTS(apiKey);
        this._callbacks = callbacks;
        this._bindSTTEvents();
        this._bindTTSEvents();
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /** Start hands-free voice session. */
    public async start(): Promise<void> {
        if (this._active) return;
        this._active = true;
        await this._startListening();
    }

    /** Stop the entire voice session. */
    public stop(): void {
        this._active = false;
        this._stt.stop();
        this._tts.stop();
        this._setState('idle');
    }

    /** Call this when the AI has finished responding; triggers TTS then returns to listening. */
    public async speakAndReturn(text: string): Promise<void> {
        if (!this._active) return;
        this._setState('speaking');
        this._stt.stop(); // Silence mic while speaking
        try {
            await this._tts.speak(text);
        } catch {
            // TTS error already emitted — just continue back to listening
        }
        if (this._active) {
            await this._startListening();
        }
    }

    /** Call this when the AI is currently processing (show processing state). */
    public setAIProcessing(): void {
        this._stt.stop();
        this._setState('ai_processing');
    }

    public get state(): VoiceState {
        return this._state;
    }

    // ─── Private ───────────────────────────────────────────────────────────────

    private async _startListening(): Promise<void> {
        // Recreate STT provider to get a fresh WebSocket connection
        this._stt.removeAllListeners();
        this._stt = new DeepgramStreamingSTT(
            (this._stt as DeepgramStreamingSTT as any)._apiKey ?? ''
        );
        this._bindSTTEvents();
        this._setState('listening');
        try {
            await this._stt.start();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this._callbacks.onError(`Microphone error: ${msg}`);
            this._setState('idle');
        }
    }

    private _bindSTTEvents(): void {
        this._stt.on('transcript', (text, isFinal) => {
            if (isFinal) {
                this._callbacks.onFinalTranscript(text);
            } else {
                this._callbacks.onPartialTranscript(text);
            }
        });

        this._stt.on('error', (error) => {
            this._callbacks.onError(`STT error: ${error.message}`);
        });
    }

    private _bindTTSEvents(): void {
        this._tts.on('error', (error) => {
            this._callbacks.onError(`TTS error: ${error.message}`);
        });
    }

    private _setState(state: VoiceState): void {
        if (this._state !== state) {
            this._state = state;
            this._callbacks.onStateChange(state);
        }
    }
}
