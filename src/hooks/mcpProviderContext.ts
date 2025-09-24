import { createContext } from 'react';

export interface McpTool {
    name: string;
    description: string;
    inputSchema: any;
}

export interface McpContextValue {
    connected: boolean;
    connecting: boolean;
    tools: McpTool[];
    callTool: (toolName: string, args: Record<string, unknown>) => Promise<any>;
}

export const McpContext = createContext<McpContextValue | undefined>(undefined);

