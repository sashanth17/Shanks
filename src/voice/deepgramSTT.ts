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
        // Validation
        if (!this._apiKey || this._apiKey.trim().length < 10) {
            console.error('[DeepgramSTT] Invalid API Key provided:', this._apiKey);
            throw new Error('Invalid Deepgram API Key. Please check your settings.');
        }

        const cleanKey = this._apiKey.trim();

        // Request microphone access
        try {
            console.log('[DeepgramSTT] Requesting microphone access...');
            this._stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            console.log('[DeepgramSTT] Microphone access granted.');
        } catch (err: any) {
            console.error('[DeepgramSTT] Microphone access failed:', err);
            if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
                throw new Error('Microphone permission denied. Please enable it in browser settings.');
            }
            throw new Error(`Microphone error: ${err?.message ?? err}`);
        }

        this._socket = this._createSocket(cleanKey);
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

    private _createSocket(apiKey: string): WebSocket {
        const cleanKey = apiKey.trim();

        if (!cleanKey.startsWith('dg-')) {
            console.warn('[DeepgramSTT] ⚠️ WARNING: Your API key does not start with "dg-". Make sure you copied the correct key from the Deepgram dashboard.');
        }

        console.log('[DeepgramSTT] Browser online status:', navigator.onLine);

        const params = new URLSearchParams({
            model: 'nova-2',
            interim_results: 'true',
            smart_format: 'true',
            punctuate: 'true',
            endpointing: '500'
        });

        const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
        console.log('[DeepgramSTT] Connecting to:', url);

        try {
            const socket = new WebSocket(url, ['token', cleanKey]);
            socket.binaryType = 'arraybuffer';

            socket.onopen = () => {
                console.log('[DeepgramSTT] WebSocket OPEN successfully. ReadyState:', socket.readyState);
                this._emit('connected');
                this._startRecorder();
            };

            socket.onmessage = (event) => {
                this._handleDeepgramMessage(event.data);
            };

            socket.onerror = (err) => {
                console.error('[DeepgramSTT] WebSocket error event:', err);
                this._emit('error', new Error('Deepgram connection failed. Please check your API key and network.'));
            };

            socket.onclose = (ev) => {
                console.log(`[DeepgramSTT] WebSocket closed. Code: ${ev.code}, Reason: ${ev.reason || '(no reason given)'}`);
                if (ev.code === 4003) {
                    console.error('[DeepgramSTT] Authentication failed (4003). Check your key.');
                } else if (ev.code === 1006) {
                    console.error('[DeepgramSTT] Connection failed before handshake (1006). This often means the key is invalid or your network/firewall is blocking the request.');
                }
                this._emit('disconnected');
            };

            return socket;
        } catch (err) {
            console.error('[DeepgramSTT] Sync error creating WebSocket:', err);
            throw err;
        }
    }

    private _startRecorder(): void {
        if (!this._stream) return;

        // Choose a supported MIME type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        this._mediaRecorder = new MediaRecorder(this._stream, { mimeType });

        this._mediaRecorder.ondataavailable = async (event) => {
            if (
                event.data.size > 0 &&
                this._socket?.readyState === WebSocket.OPEN
            ) {
                const buffer = await event.data.arrayBuffer();
                console.log(`[DeepgramSTT] Sending audio chunk: ${buffer.byteLength} bytes`);
                this._socket.send(buffer);
            } else if (event.data.size === 0) {
                console.warn('[DeepgramSTT] Ignoring empty audio chunk.');
            }
        };

        // 100ms chunks — more stable for some browsers/networks
        this._mediaRecorder.start(100);
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
