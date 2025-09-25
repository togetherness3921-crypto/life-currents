export interface ToolExecutionResult {
    content?: unknown;
    isError?: boolean;
    structuredContent?: unknown;
}

export interface Tool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
}
