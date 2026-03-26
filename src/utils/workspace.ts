import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../extension/general_utils/logger';

/**
 * T6 — Workspace Utilities
 *
 * Provides helpers for the extension host to inspect the current project.
 * These will be used by AI tools in a future version.
 */

/** Returns the absolute path to the first workspace folder root, or undefined if none is open. */
export function getWorkspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        Logger.warn('[Workspace] No workspace folder open.');
        return undefined;
    }
    return folders[0].uri.fsPath;
}

/**
 * Lists all files in the workspace matching the given glob pattern.
 * @param pattern Glob pattern (default: all files)
 * @param maxFiles Maximum number of results (default: 200)
 */
export async function listProjectFiles(
    pattern: string = '**/*',
    maxFiles: number = 200
): Promise<string[]> {
    const root = getWorkspaceRoot();
    if (!root) return [];

    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', maxFiles);
    const relativePaths = uris.map((uri) => path.relative(root, uri.fsPath));
    Logger.info(`[Workspace] listProjectFiles: found ${relativePaths.length} files matching "${pattern}".`);
    return relativePaths;
}

/**
 * Reads the contents of a file relative to the workspace root.
 * @param relativePath Path relative to workspace root
 */
export async function readWorkspaceFile(relativePath: string): Promise<string> {
    const root = getWorkspaceRoot();
    if (!root) throw new Error('No workspace folder open.');

    const absolutePath = path.join(root, relativePath);
    const uri = vscode.Uri.file(absolutePath);

    const rawBytes = await vscode.workspace.fs.readFile(uri);
    Logger.info(`[Workspace] readWorkspaceFile: ${relativePath} (${rawBytes.length} bytes)`);
    return Buffer.from(rawBytes).toString('utf-8');
}
