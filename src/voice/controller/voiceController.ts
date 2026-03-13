import { DeepgramStreamingTTS } from '../deepgramTTS';
import { ISpeechSTT, ISpeechTTS } from '../interfaces';
import { DeepgramStreamingSTT } from '../deepgramSTT';

/** Current state of the voice pipeline. */
export type VoiceState = 'idle' | 'listening' | 'ai_processing' | 'speaking';

export interface VoiceControllerCallbacks {
    /** Called when a final transcript is received. */
    onFinalTranscript: (text: string) => void;
    /** Called when a partial (interim) transcript arrives. */
    onPartialTranscript: (text: string) => void;
    /** Called when the voice state changes. */
    onStateChange: (state: VoiceState) => void;
    /** Called on unrecoverable errors. */
    onError: (message: string) => void;
}

/**
 * VoiceController
 *
 * Orchestrates the full voice pipeline:
 *   Mic → DeepgramSTT → transcript → AI
 *                              AI response → DeepgramTTS → Speaker
 *
 * Manages state transitions to prevent overlapping operations.
 * Runs in the localhost browser context (full microphone access).
 */
export class VoiceController {
    private _apiKey: string;
    private _stt: ISpeechSTT;
    private _tts: ISpeechTTS;
    private _callbacks: VoiceControllerCallbacks;
    private _state: VoiceState = 'idle';
    private _active = false;

    constructor(apiKey: string, callbacks: VoiceControllerCallbacks) {
        this._apiKey = apiKey;
        this._stt = new DeepgramStreamingSTT(apiKey);
        this._tts = new DeepgramStreamingTTS(apiKey);
        this._callbacks = callbacks;
        this._bindSTTEvents();
        this._bindTTSEvents();
    }

    // ─── Public API ─────────────────────────────────────────────────────────────

    public async start(): Promise<void> {
        if (this._active) return;
        this._active = true;
        await this._startListening();
    }

    public stop(): void {
        this._active = false;
        this._stt.stop();
        this._tts.stop();
        this._setState('idle');
    }

    /** Called after AI finishes responding — speaks the text, then returns to listening. */
    public async speakAndReturn(text: string): Promise<void> {
        if (!this._active) return;
        this._setState('speaking');
        this._stt.stop();
        try {
            await this._tts.speak(text);
        } catch {
            // TTS error already emitted
        }
        if (this._active) {
            await this._startListening();
        }
    }

    /** Called while AI is processing — stops mic, shows processing state. */
    public setAIProcessing(): void {
        this._stt.stop();
        this._setState('ai_processing');
    }

    public get state(): VoiceState {
        return this._state;
    }

    // ─── Private ────────────────────────────────────────────────────────────────

    private async _startListening(): Promise<void> {
        // Recreate STT for a fresh WebSocket connection
        this._stt.removeAllListeners();
        this._stt = new DeepgramStreamingSTT(this._apiKey);
        this._bindSTTEvents();
        this._setState('listening');
        try {
            await this._stt.start();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this._callbacks.onError(msg);
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
