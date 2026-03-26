export interface ToolRequest {
    action: string;
    request_id?: string;
    [key: string]: any;
}

export interface ToolResponse {
    action: string;
    request_id?: string;
    success: boolean;
    [key: string]: any;
}

export interface Tool {
    name: string;
    execute(request: ToolRequest): Promise<ToolResponse>;
}
