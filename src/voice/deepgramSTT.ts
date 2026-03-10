import { ISpeechSTT } from './interfaces';

type EventMap = {
    transcript: Array<(text: string, isFinal: boolean) => void>;
    error: Array<(error: Error) => void>;
    connected: Array<() => void>;
    disconnected: Array<() => void>;
};

/**
 * DeepgramStreamingSTT
 *
 * Streams microphone audio to Deepgram's Streaming Speech-To-Text API via WebSocket.
 * Uses MediaRecorder with 20ms timeslice for low-latency audio chunks (WebM/Opus).
 * Deepgram natively accepts WebM Opus — no AudioWorklet resampling needed.
 *
 * Deepgram STT WebSocket docs:
 *   https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio
 */
export class DeepgramStreamingSTT implements ISpeechSTT {
    private _apiKey: string;
    private _socket: WebSocket | null = null;
    private _mediaRecorder: MediaRecorder | null = null;
    private _stream: MediaStream | null = null;
    private _listeners: EventMap = { transcript: [], error: [], connected: [], disconnected: [] };

    // Deepgram STT endpoint configuration
    private readonly _endpoint =
        'wss://api.deepgram.com/v1/listen' +
        '?encoding=webm-opus' +
        '&sample_rate=48000' +
        '&channels=1' +
        '&interim_results=true' +
        '&endpointing=300';    // Deepgram VAD: 300ms silence = end of utterance

    constructor(apiKey: string) {
        this._apiKey = apiKey;
    }

    public async start(): Promise<void> {
        // Request microphone access — must be in a secure context (https or localhost).
        try {
            this._stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (err: any) {
            // Surface a clear, actionable error instead of the raw browser message.
            if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
                throw new Error(
                    'Microphone permission denied. ' +
                    'On macOS: open System Settings → Privacy & Security → Microphone → enable Visual Studio Code. ' +
                    'Then restart VS Code and try again.'
                );
            }
            if (err?.name === 'NotFoundError') {
                throw new Error('No microphone found. Please connect a microphone and try again.');
            }
            if (err?.name === 'NotSupportedError') {
                throw new Error('Microphone not supported in this environment (requires a secure context).');
            }
            throw new Error(`Microphone error: ${err?.message ?? err}`);
        }

        // Open Deepgram WebSocket
        this._socket = new WebSocket(this._endpoint, ['token', this._apiKey]);
        this._socket.binaryType = 'arraybuffer';

        this._socket.onopen = () => {
            this._emit('connected');
            this._startRecorder();
        };

        this._socket.onmessage = (event) => {
            this._handleDeepgramMessage(event.data);
        };

        this._socket.onerror = () => {
            this._emit('error', new Error('Deepgram WebSocket error. Check your API key and network connection.'));
        };

        this._socket.onclose = () => {
            this._emit('disconnected');
        };
    }

    public stop(): void {
        // Stop audio capture
        this._mediaRecorder?.stop();
        this._stream?.getTracks().forEach((t) => t.stop());

        // Send silent close signal then close socket
        if (this._socket && this._socket.readyState === WebSocket.OPEN) {
            // Send empty bytes as per Deepgram convention to flush final transcript
            this._socket.send(new ArrayBuffer(0));
            this._socket.close(1000, 'User stopped recording');
        }

        this._mediaRecorder = null;
        this._stream = null;
        this._socket = null;
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    private _startRecorder(): void {
        if (!this._stream) return;

        // Choose a supported MIME type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        this._mediaRecorder = new MediaRecorder(this._stream, { mimeType });

        this._mediaRecorder.ondataavailable = (event) => {
            if (
                event.data.size > 0 &&
                this._socket?.readyState === WebSocket.OPEN
            ) {
                this._socket.send(event.data);
            }
        };

        // 20ms chunks — low latency, Deepgram recommended chunk size
        this._mediaRecorder.start(20);
    }

    private _handleDeepgramMessage(raw: string): void {
        try {
            const data = JSON.parse(raw);
            const channel = data?.channel;
            const alternatives = channel?.alternatives;
            if (!alternatives?.length) return;

            const transcript: string = alternatives[0].transcript?.trim() ?? '';
            if (!transcript) return;

            const isFinal: boolean = data.is_final === true;
            this._emit('transcript', transcript, isFinal);
        } catch {
            // Ignore malformed messages
        }
    }

    // ─── Event Emitter ─────────────────────────────────────────────────────────

    public on(event: 'transcript', handler: (text: string, isFinal: boolean) => void): void;
    public on(event: 'error', handler: (error: Error) => void): void;
    public on(event: 'connected', handler: () => void): void;
    public on(event: 'disconnected', handler: () => void): void;
    public on(event: keyof EventMap, handler: any): void {
        (this._listeners[event] as any[]).push(handler);
    }

    private _emit(event: 'transcript', text: string, isFinal: boolean): void;
    private _emit(event: 'error', error: Error): void;
    private _emit(event: 'connected' | 'disconnected'): void;
    private _emit(event: keyof EventMap, ...args: any[]): void {
        (this._listeners[event] as ((...a: any[]) => void)[]).forEach((fn) => fn(...args));
    }

    public removeAllListeners(): void {
        this._listeners = { transcript: [], error: [], connected: [], disconnected: [] };
    }
}
