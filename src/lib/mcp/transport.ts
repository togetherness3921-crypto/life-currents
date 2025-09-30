export interface Transport {
    send(message: unknown): Promise<void>;
    close(): Promise<void>;
}

type EventSourceConstructor = new (url: string, eventSourceInitDict?: EventSourceInit) => EventSource;

let eventSourceCtorPromise: Promise<EventSourceConstructor> | null = null;

type LookupFunction = (hostname: string, options: unknown, callback: unknown) => void;

let nodeNetworkingSetup: Promise<void> | null = null;

const ensureNodeNetworking = async () => {
    if (typeof window !== 'undefined' || nodeNetworkingSetup) {
        if (nodeNetworkingSetup) {
            await nodeNetworkingSetup;
        }
        return;
    }

    if (typeof process === 'undefined' || !process?.versions?.node) {
        return;
    }

    nodeNetworkingSetup = (async () => {
        try {
            const dnsModule = await import(/* @vite-ignore */ 'node:dns');
            const undiciModule = await import(/* @vite-ignore */ 'undici');

            const { setDefaultResultOrder, lookup: dnsLookup, ADDRCONFIG, V4MAPPED } = dnsModule as typeof import('node:dns');
            if (typeof setDefaultResultOrder === 'function') {
                setDefaultResultOrder('ipv4first');
            }

            const { Agent, ProxyAgent, setGlobalDispatcher } = undiciModule as typeof import('undici');

            const ipv4Lookup: LookupFunction = ((hostname: string, options: unknown, callback: unknown) => {
                if (typeof options === 'function') {
                    return dnsLookup(
                        hostname,
                        { family: 4, hints: ADDRCONFIG | V4MAPPED },
                        options as Parameters<LookupFunction>[2]
                    );
                }

                const finalOptions = {
                    ...(options as Record<string, unknown>),
                    family: 4,
                    hints: (((options as { hints?: number })?.hints ?? 0) | ADDRCONFIG | V4MAPPED),
                };

                return dnsLookup(
                    hostname,
                    finalOptions,
                    callback as Parameters<LookupFunction>[2]
                );
            }) as LookupFunction;

            const proxyUrl = (process.env?.HTTPS_PROXY || process.env?.https_proxy || process.env?.HTTP_PROXY || process.env?.http_proxy);
            if (proxyUrl) {
                setGlobalDispatcher(new ProxyAgent(proxyUrl, { connect: { family: 4, lookup: ipv4Lookup } }));
            } else {
                setGlobalDispatcher(new Agent({ connect: { family: 4, lookup: ipv4Lookup } }));
            }
        } catch (error) {
            console.warn('[MCP Transport] Failed to configure Node networking for MCP client', error);
        }
    })();

    await nodeNetworkingSetup;
};

const resolveEventSource = async (): Promise<EventSourceConstructor> => {
    if (typeof EventSource !== 'undefined') {
        return EventSource;
    }
    if (!eventSourceCtorPromise) {
        eventSourceCtorPromise = import('eventsource').then((mod) => {
            const ctor = (mod as { EventSource?: EventSourceConstructor }).EventSource;
            if (!ctor) {
                throw new Error('Failed to load EventSource implementation for MCP transport.');
            }
            return ctor;
        });
    }
    return eventSourceCtorPromise;
};

export interface SSEClientTransportOptions {
    eventSourceInit?: EventSourceInit;
    requestInit?: RequestInit;
}

export class SSEClientTransport implements Transport {
    private eventSource?: EventSource;
    private endpoint?: URL;
    private abortController?: AbortController;

    constructor(private readonly url: URL, private readonly opts: SSEClientTransportOptions = {}) { }

    async start(onMessage: (message: unknown) => void, onError: (error: unknown) => void) {
        if (this.eventSource) {
            throw new Error('SSEClientTransport already started');
        }

        await ensureNodeNetworking();

        const EventSourceCtor = await resolveEventSource();

        await new Promise<void>((resolve, reject) => {
            let resolved = false;
            const eventSource = new EventSourceCtor(this.url.href, this.opts.eventSourceInit);
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
                this.abortController?.abort();
                eventSource.close();
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
