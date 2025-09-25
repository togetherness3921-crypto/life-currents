import { createContext } from 'react';
import type { Tool } from '@modelcontextprotocol/sdk/types';

export interface McpContextValue {
    connected: boolean;
    connecting: boolean;
    tools: Tool[];
    callTool: (toolName: string, args: Record<string, unknown>) => Promise<any>;
}

export const McpContext = createContext<McpContextValue | undefined>(undefined);

