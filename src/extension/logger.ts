import * as vscode from 'vscode';

/**
 * Shanks Logger — writes to the "Shanks" Output Channel.
 * Access via: View → Output → Shanks
 */
class ShanksLogger {
    private _channel: vscode.OutputChannel;

    constructor() {
        this._channel = vscode.window.createOutputChannel('Shanks');
    }

    private _format(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }

    public info(message: string): void {
        this._channel.appendLine(this._format('INFO', message));
    }

    public warn(message: string): void {
        this._channel.appendLine(this._format('WARN', message));
    }

    public error(message: string, error?: unknown): void {
        this._channel.appendLine(this._format('ERROR', message));
        if (error instanceof Error) {
            this._channel.appendLine(`  → ${error.message}`);
            if (error.stack) {
                this._channel.appendLine(error.stack);
            }
        } else if (error != null) {
            this._channel.appendLine(`  → ${String(error)}`);
        }
    }

    public debug(message: string): void {
        this._channel.appendLine(this._format('DEBUG', message));
    }

    /** Show the Output Channel panel. */
    public show(): void {
        this._channel.show(true);
    }

    /** Dispose the channel when the extension deactivates. */
    public dispose(): void {
        this._channel.dispose();
    }
}

// Export a singleton instance
export const Logger = new ShanksLogger();
