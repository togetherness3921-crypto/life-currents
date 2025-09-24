import { createContext } from 'react';

export interface McpContextValue {
    connected: boolean;
    connecting: boolean;
    tools: Tool[];
    callTool: (toolName: string, args: Record<string, unknown>) => Promise<any>;
}

export const McpContext = createContext<McpContextValue | undefined>(undefined);

