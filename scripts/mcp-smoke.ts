import { setDefaultResultOrder } from 'node:dns';

import { McpClient } from '../src/lib/mcp/client';
import { MCP_SERVER_BASE } from '../src/lib/mcp/constants';

try {
    setDefaultResultOrder('ipv4first');
} catch (error) {
    // Older Node versions or polyfilled environments may not support this API.
    if (process.env.DEBUG_MCP_SMOKE) {
        console.warn('[MCP Smoke] Unable to enforce IPv4 DNS lookup order:', error);
    }
}


const prettyPrint = (value: unknown): string => {
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch (error) {
        return String(value);
    }
};

const hasMeaningfulContent = (value: unknown): boolean => {
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value === 'string') {
        return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    if (typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>).length > 0;
    }
    return true;
};

const run = async () => {
    console.log('[MCP Smoke] Connecting to server:', MCP_SERVER_BASE);
    const client = new McpClient(MCP_SERVER_BASE);
    await client.connect();

    try {
        const tools = await client.listTools();
        console.log('[MCP Smoke] Available tools:', tools.map((tool) => tool.name).join(', '));

        const targetTool = tools.find((tool) => tool.name === 'get_todays_context');
        if (!targetTool) {
            throw new Error('Required tool "get_todays_context" not found.');
        }

        console.log('[MCP Smoke] Invoking get_todays_context...');
        const result = await client.callTool('get_todays_context', {});

        if (result.isError) {
            throw new Error('MCP tool reported an error payload.');
        }

        console.log('[MCP Smoke] Tool raw result:\n', prettyPrint(result));

        if (!hasMeaningfulContent(result.content)) {
            throw new Error('MCP tool returned no content.');
        }

        console.log('[MCP Smoke] get_todays_context returned content successfully.');
    } finally {
        await client.close();
    }
};

run()
    .then(() => {
        console.log('[MCP Smoke] Test completed successfully.');
    })
    .catch((error) => {
        console.error('[MCP Smoke] Test failed:', error);
        process.exitCode = 1;
    });
