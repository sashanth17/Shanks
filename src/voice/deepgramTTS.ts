import { ISpeechTTS } from './interfaces';

type TTSEventMap = {
    start: Array<() => void>;
    end: Array<() => void>;
    error: Array<(error: Error) => void>;
};

/**
 * DeepgramStreamingTTS
 *
 * Converts text to speech using Deepgram's Aura TTS REST API.
 * Receives audio bytes, plays them via the Web Audio context (AudioBuffer).
 * Uses the "aura-asteria-en" voice model by default (fast, natural English).
 *
 * Deepgram TTS docs:
 *   https://developers.deepgram.com/docs/tts-rest
 */
export class DeepgramStreamingTTS implements ISpeechTTS {
    private _apiKey: string;
    private _model: string;
    private _audioCtx: AudioContext | null = null;
    private _activeSources: Set<AudioBufferSourceNode> = new Set();
    private _nextStartTime: number = 0;
    private _listeners: TTSEventMap = { start: [], end: [], error: [] };

    private readonly _endpoint = 'https://api.deepgram.com/v1/speak';

    constructor(apiKey: string, model: string = 'aura-asteria-en') {
        this._apiKey = apiKey;
        this._model = model;
    }

    public async speak(text: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                this._emit('start');

                // Ensure audio context exists and is running
                if (!this._audioCtx || this._audioCtx.state === 'closed') {
                    this._audioCtx = new AudioContext();
                }
                if (this._audioCtx.state === 'suspended') {
                    await this._audioCtx.resume();
                }

                // Deepgram TTS REST call
                const response = await fetch(`${this._endpoint}?model=${this._model}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${this._apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ text }),
                });

                if (!response.ok) {
                    const err = await response.text();
                    throw new Error(`Deepgram TTS error (${response.status}): ${err}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this._audioCtx.decodeAudioData(arrayBuffer);

                // Queue playback seamlessly
                const startTime = Math.max(this._audioCtx.currentTime, this._nextStartTime);
                
                const source = this._audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(this._audioCtx.destination);

                source.onended = () => {
                    this._activeSources.delete(source);
                    if (this._activeSources.size === 0) {
                        this._emit('end');
                        this._nextStartTime = 0;
                    }
                    resolve();
                };

                this._activeSources.add(source);
                source.start(startTime);
                this._nextStartTime = startTime + audioBuffer.duration;

            } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                this._emit('error', err);
                reject(err);
            }
        });
    }

    public stop(): void {
        this._activeSources.forEach(source => {
            try { source.stop(); } catch { }
        });
        this._activeSources.clear();
        this._nextStartTime = 0;
    }

    // ─── Event Emitter ─────────────────────────────────────────────────────────

    public on(event: 'start', handler: () => void): void;
    public on(event: 'end', handler: () => void): void;
    public on(event: 'error', handler: (error: Error) => void): void;
    public on(event: keyof TTSEventMap, handler: any): void {
        (this._listeners[event] as any[]).push(handler);
    }

    private _emit(event: 'start' | 'end'): void;
    private _emit(event: 'error', error: Error): void;
    private _emit(event: keyof TTSEventMap, ...args: any[]): void {
        (this._listeners[event] as ((...a: any[]) => void)[]).forEach((fn) => fn(...args));
    }

    public removeAllListeners(): void {
        this._listeners = { start: [], end: [], error: [] };
    }
}
