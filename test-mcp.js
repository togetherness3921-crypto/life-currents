// Node-based MCP smoke test
// This script tests the MCP worker connection independent of the UI

import * as EventSourceLib from 'eventsource';
import nodeFetch from 'node-fetch';

// Polyfill for Node environment
global.EventSource = EventSourceLib.default || EventSourceLib.EventSource || EventSourceLib;
global.fetch = nodeFetch;
global.crypto = {
  randomUUID: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

const MCP_SERVER_BASE = 'https://remote-mcp-server-authless.harveymushman394.workers.dev';

class SSEClientTransport {
  constructor(url, opts = {}) {
    this.url = url;
    this.opts = opts;
  }

  async start(onMessage, onError) {
    if (this.eventSource) {
      throw new Error('SSEClientTransport already started');
    }

    await new Promise((resolve, reject) => {
      let resolved = false;
      const eventSource = new EventSource(this.url.href, this.opts.eventSourceInit);
      this.eventSource = eventSource;
      this.abortController = new AbortController();

      const finishResolve = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const finishReject = (error) => {
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      };

      eventSource.addEventListener('endpoint', (event) => {
        console.log('[MCP Transport] endpoint event received', event);
        try {
          this.endpoint = new URL(event.data, this.url);
          finishResolve();
        } catch (error) {
          onError(error);
          finishReject(error);
        }
      });

      eventSource.onmessage = (event) => {
        console.log('[MCP Transport] SSE message', event.data);
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (error) {
          onError(error);
        }
      };

      eventSource.onerror = (event) => {
        console.error('[MCP Transport] SSE error', event);
        onError(event);
        finishReject(event);
      };
    });
  }

  async send(message) {
    if (!this.endpoint) {
      console.warn('[MCP Transport] No endpoint yet, defaulting to /sse/message');
      this.endpoint = new URL('/sse/message', this.url);
    }

    const response = await fetch(this.endpoint, {
      ...this.opts.requestInit,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.opts.requestInit?.headers || {}),
      },
      body: JSON.stringify(message),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[MCP Transport] POST failed', response.status, text);
      throw new Error(`Error POSTing to endpoint (HTTP ${response.status}): ${text}`);
    }
    console.log('[MCP Transport] POST success');
  }

  async close() {
    console.log('[MCP Transport] Closing transport');
    this.abortController?.abort();
    this.eventSource?.close();
  }
}

class McpClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.pending = new Map();
  }

  async connect() {
    if (this.transport) return;
    const transport = new SSEClientTransport(new URL('/sse', this.serverUrl));
    this.transport = transport;
    await transport.start(
      (message) => this.handleMessage(message),
      (error) => this.handleError(error)
    );
  }

  async close() {
    await this.transport?.close();
    this.transport = undefined;
  }

  handleMessage(message) {
    console.log('[MCP Client] Incoming message', message);
    if (!message || !message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
    } else {
      pending.resolve(message.result);
    }
  }

  handleError(error) {
    this.pending.forEach((pending) => pending.reject(error));
    this.pending.clear();
  }

  sendRequest(method, params) {
    if (!this.transport) {
      throw new Error('Transport not connected');
    }
    const id = crypto.randomUUID();
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    return new Promise((resolve, reject) => {
      console.log('[MCP Client] Sending request', request);
      this.pending.set(id, { resolve, reject });
      this.transport.send(request).catch((error) => {
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  async listTools() {
    const result = await this.sendRequest('tools/list');
    return result.tools || [];
  }

  async callTool(name, args) {
    const rawResult = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    const result = {};
    const output = rawResult?.output;
    if (output?.isError || rawResult?.isError) {
      result.isError = true;
    }

    const contentItems = output?.content ?? rawResult?.content;
    if (contentItems && Array.isArray(contentItems)) {
      const textPieces = contentItems
        .filter((item) => item.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text);
      if (textPieces.length > 0) {
        result.content = textPieces.join('\n');
      } else {
        result.content = contentItems;
      }
    } else if (typeof rawResult?.text === 'string') {
      result.content = rawResult.text;
    }
    return result;
  }
}

async function runTest() {
  console.log('=== MCP Smoke Test ===\n');

  const client = new McpClient(MCP_SERVER_BASE);

  try {
    console.log('1. Connecting to MCP server...');
    await client.connect();
    console.log('✓ Connected successfully\n');

    console.log('2. Listing available tools...');
    const tools = await client.listTools();
    console.log(`✓ Found ${tools.length} tools:`);
    tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description || 'No description'}`);
    });
    console.log('');

    console.log('3. Calling get_todays_context...');
    const result = await client.callTool('get_todays_context', {});
    console.log('✓ Tool call succeeded');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('');

    console.log('=== All tests passed! ===');
    await client.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await client.close();
    process.exit(1);
  }
}

runTest();