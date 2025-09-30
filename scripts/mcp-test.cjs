const EventSource = require('eventsource');
// Correcting the path to be relative to the project root.
const { McpClient } = require('../src/lib/mcp/client.js');

// Polyfill EventSource for the Node.js environment
global.EventSource = EventSource;

const MCP_SERVER_BASE = 'https://remote-mcp-server-authless.harveymushman394.workers.dev';

const testMcpConnection = async () => {
    console.log(`[MCP Test] Connecting to server at ${MCP_SERVER_BASE}...`);
    // NOTE: McpClient is not a constructor in the transpiled CJS module,
    // so we access it as a property of the imported object.
    const client = new McpClient(MCP_SERVER_BASE);

    try {
        await client.connect();
        console.log('[MCP Test] Connection successful.');

        console.log('\n[MCP Test] Fetching available tools...');
        const tools = await client.listTools();
        if (tools.length === 0) {
            console.warn('[MCP Test] Warning: No tools found on the server.');
        } else {
            console.log('[MCP Test] Available tools:');
            tools.forEach((tool) => {
                console.log(`  - ${tool.name}: ${tool.description}`);
            });
        }

        const toolNameToTest = 'get_graph_structure';
        console.log(`\n[MCP Test] Calling tool: "${toolNameToTest}" with no arguments...`);

        const toolExists = tools.some((tool) => tool.name === toolNameToTest);
        if (!toolExists && tools.length > 0) {
            console.error(`[MCP Test] Error: Tool "${toolNameToTest}" not found.`);
            return;
        }
        
        const result = await client.callTool(toolNameToTest, {});

        console.log('\n[MCP Test] Tool call successful. Result:');
        console.log(JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('\n[MCP Test] An error occurred during the test:', error);
    } finally {
        console.log('\n[MCP Test] Closing connection.');
        client.close();
    }
};

testMcpConnection();
