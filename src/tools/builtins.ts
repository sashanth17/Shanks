import * as vscode from 'vscode';
import { Logger } from '../extension/logger';
import { registry } from './registry';
import { PythonServerManager } from '../extension/pythonServer';

/**
 * T5 — Built-in Tool Stubs
 *
 * These tool definitions are registered at startup.
 * The execute functions are stubs — they return a "not yet implemented" result.
 * Full implementation will be added in a future version.
 *
 * Tools the AI will eventually be able to call:
 *   - readFile
 *   - writeFile
 *   - listFiles
 *   - searchWorkspace
 *   - runTerminalCommand
 */

registry.register(
    {
        name: 'readFile',
        description: 'Read the full contents of a file in the workspace.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative path to the file from workspace root.' }
            },
            required: ['path']
        }
    },
    async (input) => {
        Logger.info(`[Tool:readFile] path=${input.path}`);
        // TODO: Implement using workspace utilities
        return { success: false, output: null, error: 'readFile is not yet fully implemented.' };
    }
);

registry.register(
    {
        name: 'writeFile',
        description: 'Write or overwrite the contents of a file in the workspace.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative path to the file.' },
                content: { type: 'string', description: 'New file content.' }
            },
            required: ['path', 'content']
        }
    },
    async (input) => {
        Logger.info(`[Tool:writeFile] path=${input.path}`);
        return { success: false, output: null, error: 'writeFile is not yet fully implemented.' };
    }
);

registry.register(
    {
        name: 'listFiles',
        description: 'List all files in the workspace, optionally filtered by glob pattern.',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Optional glob pattern (e.g. "**/*.ts").' }
            }
        }
    },
    async (input) => {
        Logger.info(`[Tool:listFiles] pattern=${input.pattern ?? '*'}`);
        return { success: false, output: null, error: 'listFiles is not yet fully implemented.' };
    }
);

registry.register(
    {
        name: 'searchWorkspace',
        description: 'Semantic vector search the workspace for specific code logic or text contexts.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Natural language representation of structural query logic needed to search.' }
            },
            required: ['query']
        }
    },
    async (input) => {
        Logger.info(`[Tool:searchWorkspace] query=${input.query}`);
        try {
            const workspaceId = vscode.workspace.name || "default-workspace";
            const payload = {
                action: "search_codebase",
                workspace_id: workspaceId,
                query: input.query,
                limit: 5  // Keep it tight to save context window
            };
            const result = await PythonServerManager.getInstance().sendRequest(payload);
            
            if (result && result.results && result.results.length > 0) {
                const formatted = result.results.map((r: any) => 
                    `[File: ${r.file_path}:${r.start_line}-${r.end_line}]\n[Scope: ${r.scope} | Type: ${r.chunk_type}]\nPreview:\n${r.preview}...`
                ).join("\n\n");
                return { success: true, output: formatted };
            }
            return { success: true, output: "No semantic contextual results found for this query in the workspace." };
        } catch(e: any) {
            Logger.error(`[Tool:searchWorkspace] VectorDB failed:`, e);
            return { success: false, output: null, error: e.message };
        }
    }
);

registry.register(
    {
        name: 'runTerminalCommand',
        description: 'Run a shell command in a VS Code terminal within the workspace.',
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Shell command to execute.' }
            },
            required: ['command']
        }
    },
    async (input) => {
        Logger.info(`[Tool:runTerminalCommand] command=${input.command}`);
        // Safety note: full implementation requires user confirmation
        return { success: false, output: null, error: 'runTerminalCommand is not yet fully implemented.' };
    }
);

export function registerBuiltinTools(): void {
    Logger.info(`[Tools] ${registry.list().length} built-in tools registered.`);
}
