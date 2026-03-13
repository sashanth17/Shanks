/**
 * voiceEntry.ts — Entry point for the standalone voice page bundle.
 *
 * This file is bundled by esbuild into dist/voice.js and served by
 * VoiceServer at http://localhost:PORT/voice.js
 *
 * It runs inside the localhost page (NOT the VS Code webview) so it
 * has full microphone permissions via getUserMedia.
 *
 * Communication with the parent VS Code webview:
 *   → parent: window.parent.postMessage({type, ...}, '*')
 *   ← parent: window.addEventListener('message', ...)
 */

import { VoiceController, VoiceState } from '../webview/voiceController';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoicePageState {
    deepgramKey: string | null;
    controller: VoiceController | null;
    state: VoiceState;
    partial: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

const pageState: VoicePageState = {
    deepgramKey: null,
    controller: null,
    state: 'idle',
    partial: '',
};

// ─── Parent Communication ─────────────────────────────────────────────────────

function sendToParent(msg: Record<string, unknown>): void {
    window.parent.postMessage(msg, '*');
}

// ─── UI Rendering ─────────────────────────────────────────────────────────────

const STATE_COLORS: Record<VoiceState, string> = {
    idle: '#ffffff22',
    listening: '#2563eb',
    ai_processing: '#7c3aed',
    speaking: '#059669',
};

const STATE_LABELS: Record<VoiceState, string> = {
    idle: 'Tap to start',
    listening: 'Listening…',
    ai_processing: 'Thinking…',
    speaking: 'Speaking…',
};

function renderUI(state: VoiceState, partial: string): void {
    const orbEl = document.getElementById('orb');
    const glowEl = document.getElementById('glow');
    const labelEl = document.getElementById('label');
    const partialEl = document.getElementById('partial');

    if (orbEl) orbEl.style.background = STATE_COLORS[state];
    if (glowEl) {
        glowEl.style.opacity = state === 'idle' ? '0' : '1';
        glowEl.style.background = STATE_COLORS[state];
    }
    if (labelEl) labelEl.textContent = STATE_LABELS[state];
    if (partialEl) partialEl.textContent = partial ? partial + '…' : '';
}

// ─── VoiceController Setup ────────────────────────────────────────────────────

function initController(apiKey: string): void {
    if (pageState.controller) {
        pageState.controller.stop();
    }

    pageState.controller = new VoiceController(apiKey, {
        onFinalTranscript: (text) => {
            pageState.partial = '';
            renderUI(pageState.state, '');
            // Send transcript to parent webview to add as user message + call AI
            sendToParent({ type: 'VOICE_TRANSCRIPT', text });
        },
        onPartialTranscript: (text) => {
            pageState.partial = text;
            renderUI(pageState.state, text);
        },
        onStateChange: (state) => {
            pageState.state = state;
            renderUI(state, pageState.partial);
            sendToParent({ type: 'VOICE_STATE', state });
        },
        onError: (message) => {
            sendToParent({ type: 'VOICE_ERROR', message });
            renderUI('idle', '');
        },
    });

    pageState.controller.start();
}

// ─── Messages from Parent Webview ─────────────────────────────────────────────

window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg?.type) return;

    switch (msg.type) {
        case 'INIT_VOICE':
            pageState.deepgramKey = msg.apiKey;
            initController(msg.apiKey);
            break;

        case 'SPEAK_RESPONSE':
            // Parent sends AI text to speak after AI finishes
            pageState.controller?.speakAndReturn(msg.text);
            break;

        case 'STOP_VOICE':
            pageState.controller?.stop();
            renderUI('idle', '');
            break;
    }
});

// ─── Orb click ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const orb = document.getElementById('orb');
    orb?.addEventListener('click', () => {
        if (pageState.state === 'idle' && pageState.controller) {
            pageState.controller.start();
        }
    });
    // Tell parent we are loaded
    sendToParent({ type: 'VOICE_PAGE_READY' });
});
