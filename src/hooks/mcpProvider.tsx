import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ToolListResponse } from '@modelcontextprotocol/sdk/client/sse';
import { connectSSE } from '@modelcontextprotocol/sdk/client/sse';
import type { ToolInvocationResponse } from '@modelcontextprotocol/sdk/client/types';
import type { Tool } from '@modelcontextprotocol/sdk/types';
import { McpContext } from './mcpProviderContext';

const MCP_SERVER_URL = 'https://remote-mcp-server-authless.harveymushman394.workers.dev';

interface ActiveSession {
    dispose: () => void;
    listTools: () => Promise<ToolListResponse>;
    callTool: (name: string, args: Record<string, unknown>) => Promise<ToolInvocationResponse>;
}

const connectToServer = async (): Promise<ActiveSession> => {
    const connection = await connectSSE({
        url: `${MCP_SERVER_URL}/sse`,
    });

    return {
        dispose: () => connection.close(),
        listTools: () => connection.listTools(),
        callTool: (name, args) => connection.callTool(name, args),
    };
};

export const McpProvider = ({ children }: { children: ReactNode }) => {
    const [tools, setTools] = useState<Tool[]>([]);
    const [connecting, setConnecting] = useState(true);
    const sessionRef = useRef<ActiveSession | null>(null);

    useEffect(() => {
        let cancelled = false;

        const establishSession = async () => {
            setConnecting(true);
            try {
                const activeSession = await connectToServer();
                if (cancelled) {
                    activeSession.dispose();
                    return;
                }
                sessionRef.current = activeSession;
                const response = await activeSession.listTools();
                setTools(response.tools ?? []);
            } catch (error) {
                console.error('[McpProvider] Failed to connect to MCP server:', error);
                sessionRef.current?.dispose();
                sessionRef.current = null;
                setTools([]);
            } finally {
                if (!cancelled) {
                    setConnecting(false);
                }
            }
        };

        establishSession();

        return () => {
            cancelled = true;
            if (sessionRef.current) {
                sessionRef.current.dispose();
                sessionRef.current = null;
            }
        };
    }, []);

    const callTool = useCallback(async (toolName: string, args: Record<string, unknown>) => {
        if (!sessionRef.current) {
            throw new Error('MCP session is not available.');
        }
        const result = await sessionRef.current.callTool(toolName, args);
        return result;
    }, []);

    const value = useMemo(() => ({
        connected: !!sessionRef.current,
        connecting,
        tools,
        callTool,
    }), [callTool, connecting, tools]);

    return <McpContext.Provider value={value}>{children}</McpContext.Provider>;
};

