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

    constructor(private readonly url: URL, private readonly opts: SSEClientTransportOptions = {}) {}

    async start(onMessage: (message: any) => void, onError: (error: unknown) => void) {
        if (this.eventSource) {
            throw new Error('SSEClientTransport already started');
        }

        await new Promise<void>((resolve, reject) => {
            const eventSource = new EventSource(this.url.href, this.opts.eventSourceInit);
            this.eventSource = eventSource;
            this.abortController = new AbortController();

            eventSource.onerror = (event) => {
                onError(event);
                reject(event);
            };

            eventSource.onopen = () => {
                resolve();
            };

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    onMessage(data);
                } catch (error) {
                    onError(error);
                }
            };
        });
    }

    async send(message: unknown): Promise<void> {
        if (!this.endpoint) {
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
            throw new Error(`Error POSTing to endpoint (HTTP ${response.status}): ${text}`);
        }
    }

    async close(): Promise<void> {
        this.abortController?.abort();
        this.eventSource?.close();
    }
}
