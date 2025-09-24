import type { Tool, ToolExecutionResult } from './types';
import { SSEClientTransport } from './transport';

type JsonRpcRequest = {
    jsonrpc: '2.0';
    id: string;
    method: string;
    params?: Record<string, unknown>;
};

type JsonRpcResponse = {
    jsonrpc: '2.0';
    id: string;
    result?: unknown;
    error?: { message: string };
};

type PendingRequest = {
    resolve: (result: unknown) => void;
    reject: (error: unknown) => void;
};

export class McpClient {
    private readonly pending = new Map<string, PendingRequest>();
    private transport?: SSEClientTransport;

    constructor(private readonly serverUrl: string) {}

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

    private handleMessage(message: JsonRpcResponse) {
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

    private handleError(error: unknown) {
        this.pending.forEach((pending) => pending.reject(error));
        this.pending.clear();
    }

    private sendRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
        if (!this.transport) {
            throw new Error('Transport not connected');
        }
        const id = crypto.randomUUID();
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.transport!.send(request).catch((error) => {
                this.pending.delete(id);
                reject(error);
            });
        }) as Promise<T>;
    }

    async listTools(): Promise<Tool[]> {
        const result = await this.sendRequest<{ tools: Tool[] }>('tools/list');
        return result.tools || [];
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
        const result = await this.sendRequest<ToolExecutionResult>('tools/call', {
            name,
            arguments: args,
        });
        return result;
    }
}
