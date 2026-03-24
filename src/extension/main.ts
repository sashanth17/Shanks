import * as vscode from 'vscode';
import { ShanksViewProvider } from './ShanksViewProvider';
import { Logger } from './logger';
import { VoiceServer } from './voiceServer';
import { registerBuiltinTools } from '../tools/builtins';
import { PythonServerManager } from './pythonServer';
import { AgentBridgeDaemon } from './agentBridge';

export function activate(context: vscode.ExtensionContext) {
    // T3: Initialize logger and show activation message
    Logger.info('Shanks extension activating...');

    // T5: Register built-in tools
    registerBuiltinTools();

    // Boot Python Backend & Index complete Workspace into Vector DB
    PythonServerManager.getInstance().start(context.extensionUri).then(async () => {
        const workspaceId = vscode.workspace.name || "default-workspace";
        const port = PythonServerManager.getInstance().port;
        
        // Start Bidirectional Remote Agent IDE Bridge immediately
        AgentBridgeDaemon.start();
        
        vscode.window.showInformationMessage(`Voice IDE Debug UI Live: http://127.0.0.1:${port}/debug`);
        vscode.window.showInformationMessage(`Initializing Voice IDE Vector Indexer for [${workspaceId}]...`);
        
        // Scan for natively supported Python, TS, and JS files, explicitly ignoring modules
        const files = await vscode.workspace.findFiles('**/*.{py,ts,js}', '**/node_modules/**');
        if (files.length > 0) {
            Logger.info(`[main] Discovered ${files.length} files. Initiating Vector indexing for [${workspaceId}]`);
            const filePaths = files.map(uri => uri.fsPath);
            const payload = {
                action: "index_workspace",
                workspace_id: workspaceId,
                file_paths: filePaths
            };
            
            try {
                const res = await PythonServerManager.getInstance().sendRequest(payload);
                let msg = `Workspace Vector Indexed [${workspaceId}]: `;
                if (res.chunks_added > 0) msg += `Added ${res.chunks_added} chunks. `;
                if (res.chunks_updated > 0) msg += `Updated ${res.chunks_updated} chunks. `;
                if (res.files_skipped > 0) msg += `Skipped ${res.files_skipped} identical files.`;
                if (res.chunks_added === 0 && res.chunks_updated === 0 && res.files_skipped === 0) msg += "No chunks found.";
                
                vscode.window.showInformationMessage(msg);
                Logger.info(`[main] Workspace indexing complete: ${msg}`);
            } catch (err: any) {
                Logger.error(`[main] Failed to index workspace`, err);
                vscode.window.showErrorMessage(`Voice IDE Workspace Vector Error: ${err.message}`);
            }
        } else {
            vscode.window.showWarningMessage(`Voice IDE Vector Indexer found 0 files in [${workspaceId}]!`);
        }
    });

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
