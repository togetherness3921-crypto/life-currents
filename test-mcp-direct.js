// Direct MCP test - skipping SSE, just testing tool calls
import nodeFetch from 'node-fetch';

const MCP_SERVER_BASE = 'https://remote-mcp-server-authless.harveymushman394.workers.dev';

async function testToolCallDirect() {
  console.log('=== Direct MCP Tool Call Test ===\n');

  try {
    // Try calling tools/list directly on /sse/message
    console.log('1. Testing tools/list on /sse/message...');
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 'test-list-' + Date.now(),
      method: 'tools/list',
    };

    const listResponse = await nodeFetch(`${MCP_SERVER_BASE}/sse/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(listToolsRequest),
    });

    console.log('Response status:', listResponse.status);
    console.log('Response headers:', Object.fromEntries(listResponse.headers.entries()));

    const listText = await listResponse.text();
    console.log('Response body:', listText);

    let listResult;
    try {
      listResult = JSON.parse(listText);
      console.log('\nParsed result:', JSON.stringify(listResult, null, 2));

      if (listResult.result && listResult.result.tools) {
        console.log(`\n✓ Found ${listResult.result.tools.length} tools:`);
        listResult.result.tools.forEach(tool => {
          console.log(`   - ${tool.name}: ${tool.description || 'No description'}`);
        });
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e.message);
    }
    console.log('');

    // Try calling get_todays_context
    console.log('2. Testing get_todays_context tool call...');
    const toolCallRequest = {
      jsonrpc: '2.0',
      id: 'test-call-' + Date.now(),
      method: 'tools/call',
      params: {
        name: 'get_todays_context',
        arguments: {},
      },
    };

    const callResponse = await nodeFetch(`${MCP_SERVER_BASE}/sse/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toolCallRequest),
    });

    console.log('Response status:', callResponse.status);
    const callText = await callResponse.text();
    console.log('Response body:', callText);

    try {
      const callResult = JSON.parse(callText);
      console.log('\nParsed result:', JSON.stringify(callResult, null, 2));

      if (callResult.result) {
        console.log('\n✓ Tool call succeeded!');
        console.log('Result structure:', {
          hasContent: !!callResult.result.content,
          hasOutput: !!callResult.result.output,
          isError: callResult.result.isError,
        });
      } else if (callResult.error) {
        console.error('\n❌ Tool call returned error:', callResult.error);
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e.message);
    }
    console.log('');

    console.log('=== Test complete ===');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testToolCallDirect();