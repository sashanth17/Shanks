// ─── Chat & AI ───────────────────────────────────────────────────────────────

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: number;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface IAIClient {
    generateResponse(prompt: string, history: ChatMessage[]): Promise<string>;
    generateStreamingResponse(prompt: string, history: ChatMessage[], onChunk: (chunk: string) => void): Promise<string>;
}

// ─── UI Modes ─────────────────────────────────────────────────────────────────

/** The three interaction modes available in the Shanks UI. */
export type InteractionMode = 'chat' | 'code' | 'agent';

// ─── Typed Webview Message Protocol ──────────────────────────────────────────

/**
 * Messages sent FROM the Extension Host TO the Webview.
 */
export type ExtensionMessage =
    | { type: 'AI_RESPONSE_START'; id: string }
    | { type: 'AI_RESPONSE_CHUNK'; id: string; chunk: string }
    | { type: 'AI_RESPONSE_END'; id: string; fullText: string }
    | { type: 'ERROR'; message: string }
    | { type: 'DEEPGRAM_API_KEY'; apiKey: string }
    | { type: 'SPEAK_TEXT'; text: string };

/**
 * Messages sent FROM the Webview TO the Extension Host.
 */
export type WebviewMessage =
    | { type: 'USER_MESSAGE'; payload: Message }
    | { type: 'VOICE_TRANSCRIPT'; text: string }
    | { type: 'MODE_CHANGE'; mode: InteractionMode }
    | { type: 'REQUEST_DEEPGRAM_KEY' };

/** Voice pipeline state reported by the VoiceController to the UI. */
export type VoiceState = 'idle' | 'listening' | 'ai_processing' | 'speaking';

// ─── Tools ────────────────────────────────────────────────────────────────────

/** Describes a single tool the AI can eventually call. */
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>; // JSON Schema-like object
}

export type ToolInput = Record<string, unknown>;

export interface ToolResult {
    success: boolean;
    output: unknown;
    error?: string;
}
