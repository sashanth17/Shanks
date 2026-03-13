import * as vscode from 'vscode';
import { ShanksViewProvider } from './ShanksViewProvider';
import { Logger } from './logger';
import { VoiceServer } from './voiceServer';
import { registerBuiltinTools } from '../tools/builtins';

export function activate(context: vscode.ExtensionContext) {
    // T3: Initialize logger and show activation message
    Logger.info('Shanks extension activating...');

    // T5: Register built-in tools
    registerBuiltinTools();

    // T2: Register the WebviewView provider for the secondary sidebar
    const provider = new ShanksViewProvider(context.extensionUri);

    // Start VoiceServer: serves voice UI at localhost, WebSocket at /ws
    const voiceServer = new VoiceServer(
        context.extensionUri,
        (text: string, isFinal: boolean) => provider.handleTranscript(text, isFinal),
        (state: string) => provider.handleVoiceState(state)
    );

    provider.setVoiceServer(voiceServer);

    voiceServer.start().then((port: number) => {
        Logger.info(`[main] VoiceServer ready -> http://127.0.0.1:${port}`);
    }).catch((err: Error) => {
        Logger.error('[main] VoiceServer failed to start.', err);
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ShanksViewProvider.viewType, provider)
    );
    Logger.info('[main] WebviewViewProvider registered for: ' + ShanksViewProvider.viewType);

    // Register the command to open/focus the panel
    context.subscriptions.push(
        vscode.commands.registerCommand('shanks.openPanel', () => {
            Logger.info('[main] shanks.openPanel command triggered.');
            vscode.commands.executeCommand('shanks.chatView.focus');
        })
    );

    // Dispose on deactivation
    context.subscriptions.push({
        dispose: () => {
            voiceServer.dispose();
            Logger.dispose();
        }
    });

    Logger.info('Shanks extension activated successfully.');
}

export function deactivate() {
    Logger.info('Shanks extension deactivated.');
}
