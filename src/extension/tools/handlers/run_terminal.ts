import * as vscode from 'vscode';
import { Logger } from '../../general_utils/logger';
import { Tool, ToolRequest, ToolResponse } from '../core/types';
import { exec } from 'child_process';

export class RunTerminalTool implements Tool {
    name = 'run_terminal';

    async execute(request: ToolRequest): Promise<ToolResponse> {
        const { command, request_id } = request;
        Logger.info(`[AgentBridge] Executing run_terminal: ${command}`);
        
        return new Promise((resolve) => {
            const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
            
            vscode.window.showInformationMessage(`Agent Executing: ${command}`);
            
            exec(command, { cwd }, (error, stdout, stderr) => {
                const outStr = stdout ? stdout.toString() : "";
                const errStr = stderr ? stderr.toString() : "";
                
                resolve({
                    action: "run_terminal_response",
                    request_id,
                    success: !error,
                    output: outStr,
                    error_output: errStr,
                    exit_code: error ? error.code : 0
                });
            });
        });
    }
}
