import { Tool, ToolRequest, ToolResponse } from './types';
import { EditFileTool } from '../handlers/edit_file';
import { RunTerminalTool } from '../handlers/run_terminal';
import { ListFilesTool } from '../handlers/list_files';

export class ToolRouter {
    private tools: Map<string, Tool> = new Map();

    constructor() {
        this.register(new EditFileTool());
        this.register(new RunTerminalTool());
        this.register(new ListFilesTool());
    }

    register(tool: Tool) {
        this.tools.set(tool.name, tool);
    }

    async route(request: ToolRequest): Promise<ToolResponse | null> {
        const tool = this.tools.get(request.action);
        if (tool) {
            return await tool.execute(request);
        }
        return null;
    }
}
