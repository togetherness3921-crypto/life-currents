import EventSource from 'eventsource';
import { McpClient } from '../src/lib/mcp/client';

// Polyfill EventSource for the Node.js environment, as McpClient relies on it.
global.EventSource = EventSource as any;

// The base URL for the remote MCP server, copied from the McpProvider.
const MCP_SERVER_BASE = 'https://remote-mcp-server-authless.harveymushman394.workers.dev';

/**
 * A standalone script to test the MCP connection and tool calls.
 * This helps debug issues with the Cloudflare Worker independent of the React UI.
 */
const testMcpConnection = async () => {
    console.log(`[MCP Test] Connecting to server at ${MCP_SERVER_BASE}...`);
    const client = new McpClient(MCP_SERVER_BASE);

    try {
        // 1. Establish the connection
        await client.connect();
        console.log('[MCP Test] Connection successful.');

        // 2. List available tools
        console.log('\n[MCP Test] Fetching available tools...');
        const tools = await client.listTools();
        if (tools.length === 0) {
            console.warn('[MCP Test] Warning: No tools found on the server.');
        } else {
            console.log('[MCP Test] Available tools:');
            tools.forEach(tool => {
                console.log(`  - ${tool.name}: ${tool.description}`);
            });
        }

        // 3. Call a specific tool ('get_graph_structure')
        const toolNameToTest = 'get_graph_structure';
        console.log(`\n[MCP Test] Calling tool: "${toolNameToTest}" with no arguments...`);
        
        // Check if the tool exists before calling it
        const toolExists = tools.some(tool => tool.name === toolNameToTest);
        if (!toolExists && tools.length > 0) {
            console.error(`[MCP Test] Error: Tool "${toolNameToTest}" not found in the list of available tools.`);
            console.log(`[MCP Test] Please check the tool name and try again.`);
            return;
        }
        
        const result = await client.callTool(toolNameToTest, {});

        console.log('\n[MCP Test] Tool call successful. Result:');
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('\n[MCP Test] An error occurred during the test:', error);
    } finally {
        // 4. Close the connection
        console.log('\n[MCP Test] Closing connection.');
        client.close();
    }
};

// Execute the test
testMcpConnection();
