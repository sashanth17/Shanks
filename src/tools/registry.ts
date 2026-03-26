import { ToolDefinition, ToolInput, ToolResult } from '../types';
import { Logger } from '../extension/general_utils/logger';

/**
 * T5 — Tool Registry
 *
 * Holds all tools the AI can eventually call.
 * Tools are registered with a name, description, and JSON-schema-like inputSchema.
 * The executor will be filled in when the AI is wired to call tools.
 */
export class ToolRegistry {
    private _tools: Map<string, { definition: ToolDefinition; execute: (input: ToolInput) => Promise<ToolResult> }> = new Map();

    /** Register a new tool. */
    register(
        definition: ToolDefinition,
        execute: (input: ToolInput) => Promise<ToolResult>
    ): void {
        this._tools.set(definition.name, { definition, execute });
        Logger.info(`[ToolRegistry] Registered tool: ${definition.name}`);
    }

    /** Execute a tool by name. */
    async execute(name: string, input: ToolInput): Promise<ToolResult> {
        const tool = this._tools.get(name);
        if (!tool) {
            Logger.error(`[ToolRegistry] Tool not found: ${name}`);
            return { success: false, output: null, error: `Tool "${name}" not found.` };
        }
        Logger.info(`[ToolRegistry] Executing tool: ${name}`);
        try {
            return await tool.execute(input);
        } catch (error) {
            Logger.error(`[ToolRegistry] Error executing tool: ${name}`, error);
            return { success: false, output: null, error: String(error) };
        }
    }

    /** List all registered tool definitions. */
    list(): ToolDefinition[] {
        return Array.from(this._tools.values()).map((t) => t.definition);
    }
}

/** Global singleton registry used across the extension. */
export const registry = new ToolRegistry();
