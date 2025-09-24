import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ClientSession } from '@modelcontextprotocol/client';
import { McpContext, McpTool } from './mcpProviderContext';

const MCP_SERVER_URL = 'https://remote-mcp-server-authless.harveymushman394.workers.dev';

export const McpProvider = ({ children }: { children: ReactNode }) => {
    const [session, setSession] = useState<ClientSession | null>(null);
    const [tools, setTools] = useState<McpTool[]>([]);
    const [connecting, setConnecting] = useState(true);

    useEffect(() => {
        let disposed = false;
        const connect = async () => {
            setConnecting(true);
            try {
                const client = new ClientSession({
                    serverUrl: `${MCP_SERVER_URL}/mcp`,
                });

                await client.initialize();

                if (disposed) {
                    client.dispose();
                    return;
                }

                const response = await client.listTools();
                setTools(response.tools as McpTool[]);
                setSession(client);
            } catch (error) {
                console.error('[McpProvider] Failed to connect to MCP server', error);
                setSession(null);
                setTools([]);
            } finally {
                if (!disposed) {
                    setConnecting(false);
                }
            }
        };

        connect();

        return () => {
            disposed = true;
            if (session) {
                session.dispose();
            }
        };
    }, []);

    const callTool = useCallback(async (toolName: string, args: Record<string, unknown>) => {
        if (!session) {
            throw new Error('MCP session not available');
        }
        const result = await session.callTool(toolName, args);
        return result;
    }, [session]);

    const value = useMemo(() => ({
        connected: !!session,
        connecting,
        tools,
        callTool,
    }), [callTool, connecting, session, tools]);

    return (
        <McpContext.Provider value={value}>
            {children}
        </McpContext.Provider>
    );
};

