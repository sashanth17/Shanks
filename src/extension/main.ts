import * as vscode from 'vscode';
import { ShanksViewProvider } from './ShanksViewProvider';
import { Logger } from './logger';
import { registerBuiltinTools } from '../tools/builtins';

export function activate(context: vscode.ExtensionContext) {
    // T3: Initialize logger and show activation message
    Logger.info('Shanks extension activating...');

    // T5: Register built-in tools
    registerBuiltinTools();

    // T2: Register the WebviewView provider for the secondary sidebar
    const provider = new ShanksViewProvider(context.extensionUri);
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

    // Dispose logger on deactivation
    context.subscriptions.push({ dispose: () => Logger.dispose() });

    Logger.info('Shanks extension activated successfully.');
}

export function deactivate() {
    Logger.info('Shanks extension deactivated.');
}
