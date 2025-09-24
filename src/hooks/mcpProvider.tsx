import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { connectSSE } from '@jsr/modelcontextprotocol__client/sse';
import type { Tool } from '@jsr/modelcontextprotocol__client/types';
import { McpContext } from './mcpProviderContext';

const MCP_SERVER_BASE = 'https://remote-mcp-server-authless.harveymushman394.workers.dev';

interface ActiveSession {
    dispose: () => void;
    listTools: () => Promise<Tool[]>;
    callTool: (name: string, args: Record<string, unknown>) => Promise<{ content: unknown }>;
}

const connectToServer = async (): Promise<ActiveSession> => {
    const client = await connectSSE(`${MCP_SERVER_BASE}/sse`);

    return {
        dispose: () => client.close(),
        listTools: async () => {
            const response = await client.listTools();
            return response.tools ?? [];
        },
        callTool: async (name, args) => client.callTool(name, args),
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
                const toolList = await activeSession.listTools();
                setTools(toolList);
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
        return sessionRef.current.callTool(toolName, args);
    }, []);

    const value = useMemo(() => ({
        connected: !!sessionRef.current,
        connecting,
        tools,
        callTool,
    }), [callTool, connecting, tools]);

    return <McpContext.Provider value={value}>{children}</McpContext.Provider>;
};

