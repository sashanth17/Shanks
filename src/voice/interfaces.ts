/**
 * Shanks Speech Abstraction Layer
 *
 * Provider-agnostic interfaces for Speech-to-Text and Text-to-Speech.
 * Any future provider (Deepgram, OpenAI Whisper, local model) must implement these.
 */

// ─── STT ─────────────────────────────────────────────────────────────────────

export type STTEvent =
    | { type: 'transcript'; text: string; isFinal: boolean }
    | { type: 'error'; error: Error }
    | { type: 'connected' }
    | { type: 'disconnected' };

export type STTEventHandler<E extends STTEvent = STTEvent> = (event: E) => void;

/**
 * ISpeechSTT — provider-agnostic streaming Speech-to-Text interface.
 *
 * Implementations:
 *   - DeepgramStreamingSTT   (src/voice/deepgramSTT.ts)
 */
export interface ISpeechSTT {
    /** Begin streaming microphone audio to the provider. */
    start(): Promise<void>;

    /** Stop the audio stream and close the connection. */
    stop(): void;

    /** Subscribe to speech events. */
    on(event: 'transcript', handler: (text: string, isFinal: boolean) => void): void;
    on(event: 'error', handler: (error: Error) => void): void;
    on(event: 'connected', handler: () => void): void;
    on(event: 'disconnected', handler: () => void): void;

    /** Remove all listeners. */
    removeAllListeners(): void;
}

// ─── TTS ─────────────────────────────────────────────────────────────────────

export type TTSEvent =
    | { type: 'start' }
    | { type: 'end' }
    | { type: 'error'; error: Error };

/**
 * ISpeechTTS — provider-agnostic Text-to-Speech interface.
 *
 * Implementations:
 *   - DeepgramStreamingTTS   (src/voice/deepgramTTS.ts)
 */
export interface ISpeechTTS {
    /** Synthesize text and play it through the speaker. Resolves when playback ends. */
    speak(text: string): Promise<void>;

    /** Interrupt current playback. */
    stop(): void;

    /** Subscribe to TTS lifecycle events. */
    on(event: 'start', handler: () => void): void;
    on(event: 'end', handler: () => void): void;
    on(event: 'error', handler: (error: Error) => void): void;

    /** Remove all listeners. */
    removeAllListeners(): void;
}
