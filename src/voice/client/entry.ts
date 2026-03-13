import { VoiceController, VoiceState } from '../controller/voiceController';

declare const process: { env: { BUILD_VERSION: string } };

// ─── Globals injected by the voice server HTML ────────────────────────────────
declare const VOICE_WS_PORT: number;  // injected as window.VOICE_WS_PORT

// ─── WebSocket connection to Extension Host ───────────────────────────────────
let ws: WebSocket | null = null;
let voiceController: VoiceController | null = null;
let currentState: VoiceState = 'idle';
let partial = '';

function connectWebSocket(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
        ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

        ws.onopen = () => {
            log('[entry] WebSocket connected to extension host.');
            ws!.send(JSON.stringify({ type: 'REQUEST_DEEPGRAM_KEY' }));
            resolve();
        };

        ws.onmessage = (event) => {
            handleExtensionMessage(JSON.parse(event.data));
        };

        ws.onerror = () => {
            log('[entry] WebSocket error — could not connect to extension.');
            reject(new Error('WebSocket connection failed'));
        };

        ws.onclose = () => {
            log('[entry] WebSocket closed.');
        };
    });
}

function sendToExtension(msg: object) {
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function handleExtensionMessage(msg: any) {
    switch (msg.type) {
        case 'DEEPGRAM_KEY':
            console.log('[entry] Received Deepgram API key from extension.');
            if (msg.apiKey) {
                console.log('[entry] API Key length:', msg.apiKey.length);
                console.log('[entry] API Key prefix:', msg.apiKey.slice(0, 8) + '...');
                localStorage.setItem('deepgram_api_key', msg.apiKey);
                initVoiceController(msg.apiKey);
            } else {
                showError('Deepgram API key not found in extension settings.');
            }
            break;
        case 'AI_START':
            setState('ai_processing');
            updateAIText('');
            break;
        case 'AI_CHUNK':
            appendAIText(msg.chunk);
            break;
        case 'AI_END':
            updateAIText(msg.fullText);
            // Speak the full response
            voiceController?.speakAndReturn(msg.fullText);
            break;
        case 'ERROR':
            showError(msg.message);
            setState('idle');
            break;
    }
}

function initVoiceController(apiKey: string) {
    if (voiceController) voiceController.stop();

    voiceController = new VoiceController(apiKey, {
        onFinalTranscript: (text) => {
            setPartialText('');
            setUserText(text);
            voiceController?.setAIProcessing();
            sendToExtension({ type: 'TRANSCRIPT', isFinal: true, text });
        },
        onPartialTranscript: (text) => {
            setPartialText(text);
            sendToExtension({ type: 'TRANSCRIPT', isFinal: false, text });
        },
        onStateChange: (state) => {
            setState(state);
            sendToExtension({ type: 'STATE_CHANGE', state });
        },
        onError: (message) => {
            showError(message);
            setState('idle');
        },
    });

    // Auto-start listening
    voiceController.start();
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
const STATE_LABELS: Record<VoiceState, string> = {
    idle: 'Tap to start',
    listening: 'Listening…',
    ai_processing: 'Thinking…',
    speaking: 'Speaking…',
};

function setState(state: VoiceState) {
    currentState = state;
    partial = '';

    const orb = document.getElementById('orb');
    const glow = document.getElementById('glow');
    const label = document.getElementById('label');
    if (!orb || !glow || !label) return;

    orb.className = `orb ${state}`;
    glow.className = `glow ${state}`;
    label.textContent = STATE_LABELS[state];

    // Inner orb content
    const micIcon = document.getElementById('mic-icon');
    const bars = document.getElementById('bars');
    const dots = document.getElementById('dots');
    if (!micIcon || !bars || !dots) return;

    micIcon.style.display = state === 'listening' || state === 'idle' ? 'block' : 'none';
    bars.style.display = state === 'speaking' ? 'flex' : 'none';
    dots.style.display = state === 'ai_processing' ? 'flex' : 'none';
}

function setPartialText(text: string) {
    partial = text;
    const el = document.getElementById('transcript');
    if (el) el.textContent = text ? text + '…' : '';
}

function setUserText(text: string) {
    const el = document.getElementById('transcript');
    if (el) el.textContent = text;
}

function updateAIText(text: string) {
    const el = document.getElementById('ai-response');
    if (el) el.textContent = text;
}

function appendAIText(chunk: string) {
    const el = document.getElementById('ai-response');
    if (el) el.textContent = (el.textContent || '') + chunk;
}

function showError(message: string) {
    updateAIText('⚠️ ' + message);
}

function log(msg: string) {
    console.log(msg);
}

// ─── Orb click handler ────────────────────────────────────────────────────────
(window as any).handleOrbClick = function () {
    if (currentState === 'idle' && voiceController) {
        voiceController.start();
    }
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
(async function boot() {
    console.log('VOICE CAPTURE BUILD VERSION:', process.env.BUILD_VERSION);
    
    const cachedKey = localStorage.getItem('deepgram_api_key');
    if (cachedKey) {
        console.log('[entry] Using cached Deepgram API key from localStorage');
        initVoiceController(cachedKey);
    }

    const port: number = (window as any).VOICE_WS_PORT;
    connectWebSocket(port).catch((err) => {
        showError('Could not connect to Shanks extension. Is VS Code running?');
    });
})();
