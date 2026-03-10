import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, ExtensionMessage, InteractionMode, VoiceState } from '../types';
import { VoiceController } from './voiceController';

// ─── VS Code API ──────────────────────────────────────────────────────────────
// @ts-ignore
const vscode = acquireVsCodeApi();

// ─── Interaction Mode Config ──────────────────────────────────────────────────
const INTERACTION_MODES: { id: InteractionMode; label: string; description: string; icon: string }[] = [
    { id: 'chat', label: 'Chat', description: 'General Q&A', icon: '💬' },
    { id: 'code', label: 'Code', description: 'Code generation & editing', icon: '⌨️' },
    { id: 'agent', label: 'Agent', description: 'Multi-step tasks (coming soon)', icon: '🤖' },
];

// ─── Voice state display config ───────────────────────────────────────────────
const VOICE_STATE_LABEL: Record<VoiceState, string> = {
    idle: 'Tap to start',
    listening: 'Listening…',
    ai_processing: 'Thinking…',
    speaking: 'Speaking…',
};

export const App: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [interactionMode, setInteractionMode] = useState<InteractionMode>('chat');
    const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
    const [voiceState, setVoiceState] = useState<VoiceState>('idle');
    const [partialTranscript, setPartialTranscript] = useState('');
    const [deepgramKeyReady, setDeepgramKeyReady] = useState(false);
    const [micPermissionError, setMicPermissionError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const voiceControllerRef = useRef<VoiceController | null>(null);
    // Track the id of the in-progress ai response for voice mode
    const pendingAiResponseRef = useRef<{ id: string; text: string } | null>(null);

    // ─── Scroll ───────────────────────────────────────────────────────────────
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ─── Extension Host message handler ──────────────────────────────────────
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const msg = event.data as ExtensionMessage;
            switch (msg.type) {
                case 'AI_RESPONSE_START':
                    pendingAiResponseRef.current = { id: msg.id, text: '' };
                    setMessages((prev) => [
                        ...prev,
                        { id: msg.id, role: 'assistant', text: '', timestamp: Date.now() },
                    ]);
                    if (voiceModeEnabled) setVoiceState('ai_processing');
                    break;

                case 'AI_RESPONSE_CHUNK':
                    if (pendingAiResponseRef.current?.id === msg.id) {
                        pendingAiResponseRef.current.text += msg.chunk;
                    }
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === msg.id ? { ...m, text: m.text + msg.chunk } : m
                        )
                    );
                    break;

                case 'AI_RESPONSE_END':
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === msg.id ? { ...m, text: msg.fullText } : m
                        )
                    );
                    // In voice mode: hand the final text off to TTS then return to listening
                    if (voiceModeEnabled && voiceControllerRef.current) {
                        voiceControllerRef.current.speakAndReturn(msg.fullText);
                    }
                    pendingAiResponseRef.current = null;
                    break;

                case 'ERROR':
                    // Detect microphone permission errors specifically
                    if (msg.message.toLowerCase().includes('microphone') ||
                        msg.message.toLowerCase().includes('permission') ||
                        msg.message.toLowerCase().includes('denied')) {
                        setMicPermissionError(msg.message);
                        setVoiceState('idle');
                    } else {
                        setMessages((prev) => [
                            ...prev,
                            { id: Date.now().toString(), role: 'assistant', text: `⚠️ ${msg.message}`, timestamp: Date.now() },
                        ]);
                        if (voiceModeEnabled) setVoiceState('idle');
                    }
                    break;

                case 'DEEPGRAM_API_KEY':
                    setDeepgramKeyReady(true);
                    _initVoiceController(msg.apiKey);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [voiceModeEnabled]);

    // ─── VoiceController Initialization ──────────────────────────────────────
    const _initVoiceController = useCallback((apiKey: string) => {
        if (voiceControllerRef.current) {
            voiceControllerRef.current.stop();
        }

        voiceControllerRef.current = new VoiceController(apiKey, {
            onFinalTranscript: (text) => {
                setPartialTranscript('');
                const userMsg: Message = {
                    id: Date.now().toString(),
                    role: 'user',
                    text,
                    timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, userMsg]);
                voiceControllerRef.current?.setAIProcessing();
                vscode.postMessage({ type: 'USER_MESSAGE', payload: userMsg });
            },
            onPartialTranscript: (text) => {
                setPartialTranscript(text);
            },
            onStateChange: (state) => {
                setVoiceState(state);
                if (state !== 'listening') setPartialTranscript('');
            },
            onError: (message) => {
                // Separate mic permission errors from general errors
                if (message.toLowerCase().includes('permission') ||
                    message.toLowerCase().includes('denied') ||
                    message.toLowerCase().includes('microphone')) {
                    setMicPermissionError(message);
                    setVoiceState('idle');
                } else {
                    setMessages((prev) => [
                        ...prev,
                        { id: Date.now().toString(), role: 'assistant', text: `⚠️ ${message}`, timestamp: Date.now() },
                    ]);
                    setVoiceState('idle');
                }
            },
        });
    }, []);

    // ─── Voice Toggle ─────────────────────────────────────────────────────────
    const handleVoiceModeToggle = () => {
        const turning_on = !voiceModeEnabled;
        setVoiceModeEnabled(turning_on);
        setMicPermissionError(null); // clear any previous error on toggle

        if (turning_on) {
            if (!deepgramKeyReady) {
                vscode.postMessage({ type: 'REQUEST_DEEPGRAM_KEY' });
            } else if (voiceControllerRef.current) {
                voiceControllerRef.current.start();
            }
        } else {
            voiceControllerRef.current?.stop();
            setVoiceState('idle');
            setPartialTranscript('');
            setMicPermissionError(null);
        }
    };

    // Start listening once key is ready and voice mode is enabled
    useEffect(() => {
        if (deepgramKeyReady && voiceModeEnabled && voiceControllerRef.current) {
            voiceControllerRef.current.start();
        }
    }, [deepgramKeyReady, voiceModeEnabled]);

    // Cleanup on unmount
    useEffect(() => {
        return () => { voiceControllerRef.current?.stop(); };
    }, []);

    // ─── Chat Handlers ────────────────────────────────────────────────────────
    const handleSend = () => {
        if (!inputText.trim()) return;
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: inputText.trim(),
            timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        vscode.postMessage({ type: 'USER_MESSAGE', payload: userMsg });
        setInputText('');
    };

    const switchInteractionMode = (mode: InteractionMode) => {
        setInteractionMode(mode);
        vscode.postMessage({ type: 'MODE_CHANGE', mode });
    };

    const getModeHint = (): string => {
        if (interactionMode === 'code') return '⌨️ Code mode — optimized for code generation & editing.';
        if (interactionMode === 'agent') return '🤖 Agent mode — multi-step tasks. (Coming soon)';
        return '';
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--vscode-sideBar-background)', color: 'var(--vscode-editor-foreground)' }}>

            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="flex flex-col border-b border-white/10 bg-white/5">
                <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-xs font-bold uppercase tracking-widest opacity-50 select-none">Shanks</span>
                    <button
                        onClick={handleVoiceModeToggle}
                        title={voiceModeEnabled ? 'Exit Voice Mode' : 'Enter Voice Mode (Deepgram)'}
                        className={`p-1.5 rounded-lg text-xs transition-all border ${voiceModeEnabled ? 'bg-blue-600 border-blue-400 text-white' : 'border-white/10 text-white/30 hover:text-white hover:border-white/20'}`}
                    >
                        🎙️
                    </button>
                </div>
                {/* Mode Tabs */}
                <div className="flex border-t border-white/5">
                    {INTERACTION_MODES.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => switchInteractionMode(m.id)}
                            title={m.description}
                            disabled={m.id === 'agent'}
                            className={`flex-1 py-1.5 text-xs transition-all border-b-2 ${interactionMode === m.id ? 'border-blue-500 text-white' : 'border-transparent text-white/30 hover:text-white/70'
                                } ${m.id === 'agent' ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                            {m.icon} {m.label}
                        </button>
                    ))}
                </div>
                {getModeHint() && (
                    <div className="px-4 py-1 text-[10px] text-white/40 border-t border-white/5">{getModeHint()}</div>
                )}
            </div>

            {/* ── Voice Interface ───────────────────────────────────────────── */}
            {voiceModeEnabled ? (
                <div className="flex-1 flex flex-col items-center justify-between p-8 py-14"
                    style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(37,99,235,0.05) 100%)' }}
                >
                    {/* ── Permission Error Card ───────────────────────────── */}
                    {micPermissionError ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 text-center w-full">
                            <div className="text-4xl">🎙️</div>
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-red-400">Microphone Access Required</h3>
                                <p className="text-xs text-white/50 leading-relaxed max-w-[240px]">
                                    VS Code needs microphone permission. Follow these steps:
                                </p>
                            </div>
                            <ol className="text-left space-y-2 w-full max-w-[240px]">
                                {[
                                    'Open System Settings',
                                    'Go to Privacy & Security → Microphone',
                                    'Enable Visual Studio Code',
                                    'Restart VS Code'
                                ].map((step, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-white/60">
                                        <span className="w-5 h-5 rounded-full bg-blue-600/40 text-blue-300 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold">{i + 1}</span>
                                        {step}
                                    </li>
                                ))}
                            </ol>
                            <button
                                onClick={() => { setMicPermissionError(null); voiceControllerRef.current?.start(); }}
                                className="mt-2 px-4 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Status */}
                            <div className="text-center space-y-1">
                                <h2 className="text-xl font-light tracking-tight">{VOICE_STATE_LABEL[voiceState]}</h2>
                                <p className="text-[10px] text-white/30 uppercase tracking-widest">
                                    {deepgramKeyReady ? 'Deepgram' : 'Waiting for API key…'}
                                </p>
                            </div>

                            {/* Orb */}
                            <div className="relative">
                                <div className={`absolute inset-0 rounded-full blur-2xl transition-all duration-1000 ${voiceState === 'listening' ? 'bg-blue-500/20 scale-150 opacity-100' :
                                    voiceState === 'speaking' ? 'bg-emerald-500/20 scale-150 opacity-100' :
                                        voiceState === 'ai_processing' ? 'bg-purple-500/15 scale-110 opacity-100' :
                                            'scale-0 opacity-0'
                                    }`} />

                                <div className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 border-4 ${voiceState === 'listening' ? 'bg-blue-600 border-blue-400 shadow-[0_0_40px_rgba(37,99,235,0.4)] animate-pulse-custom' :
                                    voiceState === 'speaking' ? 'bg-emerald-600 border-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.4)]' :
                                        voiceState === 'ai_processing' ? 'bg-purple-600 border-purple-400 shadow-[0_0_30px_rgba(147,51,234,0.3)]' :
                                            'bg-white/5 border-white/10 hover:border-white/20 cursor-pointer'
                                    }`}
                                    onClick={voiceState === 'idle' ? () => voiceControllerRef.current?.start() : undefined}
                                >
                                    {voiceState === 'speaking' ? (
                                        <div className="flex space-x-1 items-center">
                                            {[8, 14, 10, 14, 8].map((h, i) => (
                                                <div key={i} className="w-1 bg-white rounded-full animate-bounce"
                                                    style={{ height: h, animationDelay: `${i * 0.08}s` }} />
                                            ))}
                                        </div>
                                    ) : voiceState === 'ai_processing' ? (
                                        <div className="flex space-x-1.5 items-center">
                                            {[0, 0.2, 0.4].map((d, i) => (
                                                <span key={i} className="w-2 h-2 bg-white/70 rounded-full animate-bounce" style={{ animationDelay: `${d}s` }} />
                                            ))}
                                        </div>
                                    ) : (
                                        <svg className={`w-10 h-10 ${voiceState === 'listening' ? 'text-white' : 'text-white/20'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                        </svg>
                                    )}
                                </div>
                            </div>

                            {/* Partial transcript / last AI reply */}
                            <div className="w-full max-w-xs text-center min-h-[4rem] flex items-center justify-center">
                                {partialTranscript ? (
                                    <p className="text-sm text-blue-300/70 italic leading-relaxed">{partialTranscript}…</p>
                                ) : messages.length > 0 && messages[messages.length - 1].role === 'assistant' ? (
                                    <p className="text-sm font-light text-white/40 leading-relaxed line-clamp-3">
                                        {messages[messages.length - 1].text}
                                    </p>
                                ) : (
                                    <p className="text-xs text-white/20 uppercase tracking-widest">
                                        {voiceState === 'idle' ? 'Tap the orb to begin' : ''}
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            ) : null} {/* Close the voiceModeEnabled conditional here */}

            {/* ── Chat Interface ───────────────────────────────────────── */}
            {!voiceModeEnabled && (
                <div className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 text-center px-8">
                                <div className="text-4xl mb-3">{interactionMode === 'code' ? '⌨️' : '💬'}</div>
                                <p className="text-sm">{interactionMode === 'code' ? 'Describe the code you need' : 'Ask Shanks anything'}</p>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[88%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-tr-none'
                                    : 'bg-white/10 rounded-tl-none border border-white/5'
                                    }`}>
                                    {msg.text || (msg.role === 'assistant' && (
                                        <span className="flex space-x-1 py-0.5">
                                            {[0, 0.2, 0.4].map((d, i) => (
                                                <span key={i} className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: `${d}s` }} />
                                            ))}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-white/10 bg-white/5">
                        <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2 border border-white/10 focus-within:border-blue-500/40 transition-all">
                            <input
                                type="text"
                                className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/20"
                                placeholder={interactionMode === 'code' ? 'Describe the code you need…' : 'Message Shanks…'}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!inputText.trim()}
                                className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-all disabled:opacity-25 disabled:pointer-events-none"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
