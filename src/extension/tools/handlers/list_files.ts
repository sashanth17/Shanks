import * as vscode from 'vscode';
import { Logger } from '../../general_utils/logger';
import { Tool, ToolRequest, ToolResponse } from '../core/types';

export class ListFilesTool implements Tool {
    name = 'list_files';

    async execute(request: ToolRequest): Promise<ToolResponse> {
        const { request_id } = request;
        Logger.info(`[AgentBridge] Executing list_files`);
        
        try {
            const files = await vscode.workspace.findFiles('**/*.*', '**/node_modules/**');
            return {
                action: "list_files_response",
                request_id,
                success: true,
                files: files.map(f => f.fsPath)
            };
        } catch(e) {
            Logger.error(`[AgentBridge] list_files failed`, e);
            return {
                action: "list_files_response",
                request_id,
                success: false,
                files: []
            };
        }
    }
}
