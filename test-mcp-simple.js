// Simplified MCP test using direct HTTP requests
import nodeFetch from 'node-fetch';

const MCP_SERVER_BASE = 'https://remote-mcp-server-authless.harveymushman394.workers.dev';

async function testMCPDirect() {
  console.log('=== Direct MCP HTTP Test ===\n');

  try {
    // Step 1: Test SSE endpoint to get the message endpoint
    console.log('1. Testing SSE connection...');
    const sseResponse = await nodeFetch(`${MCP_SERVER_BASE}/sse`, {
      headers: {
        'Accept': 'text/event-stream',
      },
    });

    console.log('SSE Response status:', sseResponse.status);
    console.log('SSE Response headers:', Object.fromEntries(sseResponse.headers.entries()));

    // Read a bit of the SSE stream
    const reader = sseResponse.body.getReader();
    const decoder = new TextDecoder();
    let sseData = '';

    // Read for 2 seconds to get the endpoint event
    const timeout = setTimeout(() => {}, 2000);
    while (sseData.length < 500) {
      const { done, value } = await reader.read();
      if (done) break;
      sseData += decoder.decode(value, { stream: true });
      if (sseData.includes('event: endpoint')) break;
    }
    clearTimeout(timeout);

    console.log('SSE initial data:', sseData);

    // Extract endpoint URL from SSE data
    const endpointMatch = sseData.match(/data:\s*(.+)/);
    const messageEndpoint = endpointMatch ? endpointMatch[1].trim() : '/sse/message';
    console.log('Message endpoint:', messageEndpoint);
    console.log('');

    // Step 2: Send tools/list request
    console.log('2. Sending tools/list request...');
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 'test-' + Date.now(),
      method: 'tools/list',
    };

    const listResponse = await nodeFetch(`${MCP_SERVER_BASE}${messageEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(listToolsRequest),
    });

    console.log('List tools response status:', listResponse.status);
    const listResult = await listResponse.json();
    console.log('List tools result:', JSON.stringify(listResult, null, 2));
    console.log('');

    // Step 3: Call get_todays_context
    console.log('3. Calling get_todays_context...');
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 'test-' + Date.now(),
      method: 'tools/call',
      params: {
        name: 'get_todays_context',
        arguments: {},
      },
    };

    const callResponse = await nodeFetch(`${MCP_SERVER_BASE}${messageEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toolCallRequest),
    });

    console.log('Tool call response status:', callResponse.status);
    const callResult = await callResponse.json();
    console.log('Tool call result:', JSON.stringify(callResult, null, 2));
    console.log('');

    console.log('=== All tests passed! ===');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testMCPDirect();