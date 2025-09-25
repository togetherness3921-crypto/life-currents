export interface Transport {
    send(message: unknown): Promise<void>;
    close(): Promise<void>;
}

export interface SSEClientTransportOptions {
    eventSourceInit?: EventSourceInit;
    requestInit?: RequestInit;
}

export class SSEClientTransport implements Transport {
    private eventSource?: EventSource;
    private endpoint?: URL;
    private abortController?: AbortController;

    constructor(private readonly url: URL, private readonly opts: SSEClientTransportOptions = {}) { }

    async start(onMessage: (message: any) => void, onError: (error: unknown) => void) {
        if (this.eventSource) {
            throw new Error('SSEClientTransport already started');
        }

        await new Promise<void>((resolve, reject) => {
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

            const finishReject = (error: unknown) => {
                if (!resolved) {
                    resolved = true;
                    reject(error);
                }
            };

            eventSource.addEventListener('endpoint', (event) => {
                console.log('[MCP Transport] endpoint event received', event);
                try {
                    const messageEvent = event as MessageEvent<string>;
                    this.endpoint = new URL(messageEvent.data, this.url);
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

    async send(message: unknown): Promise<void> {
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

    async close(): Promise<void> {
        console.log('[MCP Transport] Closing transport');
        this.abortController?.abort();
        this.eventSource?.close();
    }
}
