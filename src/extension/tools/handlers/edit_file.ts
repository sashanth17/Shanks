import * as vscode from 'vscode';
import { Logger } from '../../general_utils/logger';
import { Tool, ToolRequest, ToolResponse } from '../core/types';

export class EditFileTool implements Tool {
    name = 'edit_file';

    async execute(request: ToolRequest): Promise<ToolResponse> {
        const { file_path, content, request_id } = request;
        Logger.info(`[AgentBridge] Executing edit_file for ${file_path}`);
        
        try {
            const uri = vscode.Uri.file(file_path);
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
            return {
                action: "edit_file_response",
                request_id,
                success: applied
            };
        } catch(e) {
            Logger.error(`[AgentBridge] Edit file failed`, e);
            return {
                action: "edit_file_response",
                request_id,
                success: false
            };
        }
    }
}
