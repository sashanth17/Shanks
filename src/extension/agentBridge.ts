import * as vscode from 'vscode';
import { PythonServerManager } from './pythonServer';
import { Logger } from './logger';
import { exec } from 'child_process';

export class AgentBridgeDaemon {
    public static async start() {
        try {
            const socket = await PythonServerManager.getInstance().createSocket();
            Logger.info(`[AgentBridge] Attached to Python Server.`);

            // Send registration hook immediately
            socket.write(JSON.stringify({ action: "register_ide_frontend" }) + "\n");

            let dataBuffer = "";

            socket.on('data', async (data) => {
                dataBuffer += data.toString();
                let boundary = dataBuffer.indexOf("\n");
                
                while (boundary !== -1) {
                    const line = dataBuffer.slice(0, boundary).trim();
                    dataBuffer = dataBuffer.slice(boundary + 1);
                    boundary = dataBuffer.indexOf("\n");

                    if (!line) continue;

                    try {
                        const parsed = JSON.parse(line);
                        
                        if (parsed.action === "edit_file") {
                            Logger.info(`[AgentBridge] Executing edit_file for ${parsed.file_path}`);
                            const success = await this.handleEditFile(parsed.file_path, parsed.content);
                            socket.write(JSON.stringify({ 
                                action: "edit_file_response", 
                                request_id: parsed.request_id, 
                                success 
                            }) + "\n");
                        } 
                        else if (parsed.action === "run_terminal") {
                            Logger.info(`[AgentBridge] Executing run_terminal: ${parsed.command}`);
                            const result = await this.handleRunTerminal(parsed.command);
                            socket.write(JSON.stringify({ 
                                action: "run_terminal_response", 
                                request_id: parsed.request_id, 
                                ...result
                            }) + "\n");
                        }
                        else if (parsed.action === "list_files") {
                            Logger.info(`[AgentBridge] Executing list_files`);
                            const files = await vscode.workspace.findFiles('**/*.*', '**/node_modules/**');
                            socket.write(JSON.stringify({ 
                                action: "list_files_response", 
                                request_id: parsed.request_id, 
                                success: true,
                                files: files.map(f => f.fsPath)
                            }) + "\n");
                        }
                    } catch (e) {
                        Logger.error("[AgentBridge] Failed to parse payload:", e);
                    }
                }
            });

            socket.on('error', (err) => {
                Logger.error("[AgentBridge] Socket error:", err);
            });
            
            socket.on('close', () => {
                Logger.info("[AgentBridge] Socket closed. Attempting reconnect in 5s...");
                setTimeout(() => this.start(), 5000);
            });

        } catch (e) {
            Logger.error(`[AgentBridge] Connection failed`, e);
            setTimeout(() => this.start(), 5000);
        }
    }

    private static async handleEditFile(filePath: string, content: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            edit.replace(uri, fullRange, content);
            const applied = await vscode.workspace.applyEdit(edit);
            if (applied) {
                // Automatically save it so the python process can instantly read the change if needed
                await document.save();
            }
            return applied;
        } catch(e) {
            Logger.error(`[AgentBridge] Edit file failed`, e);
            return false;
        }
    }

    private static async handleRunTerminal(command: string): Promise<any> {
        return new Promise((resolve) => {
            const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
            
            vscode.window.showInformationMessage(`Agent Executing: ${command}`);
            
            exec(command, { cwd }, (error, stdout, stderr) => {
                const outStr = stdout ? stdout.toString() : "";
                const errStr = stderr ? stderr.toString() : "";
                
                resolve({
                    success: !error,
                    output: outStr,
                    error_output: errStr,
                    exit_code: error ? error.code : 0
                });
            });
        });
    }
}
