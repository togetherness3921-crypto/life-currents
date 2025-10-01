import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ModelSelectionContext, SelectedModel } from './modelSelectionProviderContext';

// Usage is tracked using a rolling window approximation. For simplicity we store
// timestamps in localStorage and prune entries beyond 72h when accessed.

const STORAGE_KEY = 'model_usage_history_v1';
const TOOL_INTENT_PREFIX = 'tool_intent_check_';
export const SEED_MODELS: SelectedModel[] = [
    { id: 'openai/gpt-5', label: 'OpenAI GPT-5' },
    { id: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
    { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
    { id: 'anthropic/claude-opus-4.1', label: 'Claude Opus 4.1' },
    { id: 'x-ai/grok-4-fast', label: 'xAI Grok 4 Fast' },
];

const ROLLING_WINDOW_MS = 72 * 60 * 60 * 1000;

interface UsageHistoryEntry {
    modelId: string;
    timestamp: number;
}

const readUsageHistory = (): UsageHistoryEntry[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => typeof item?.modelId === 'string' && typeof item?.timestamp === 'number');
    } catch (error) {
        console.warn('[ModelSelection] Failed to read usage history', error);
        return [];
    }
};

const writeUsageHistory = (history: UsageHistoryEntry[]) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.warn('[ModelSelection] Failed to write usage history', error);
    }
};

const pruneHistory = (history: UsageHistoryEntry[]): UsageHistoryEntry[] => {
    const cutoff = Date.now() - ROLLING_WINDOW_MS;
    return history.filter((entry) => entry.timestamp >= cutoff);
};

export const ModelSelectionProvider = ({ children }: { children: ReactNode }) => {
    const [selectedModel, setSelectedModelState] = useState<SelectedModel>(() => SEED_MODELS[1]);
    const [usageHistory, setUsageHistory] = useState<UsageHistoryEntry[]>(() => pruneHistory(readUsageHistory()));
    const [toolIntentSettings, setToolIntentSettings] = useState<Record<string, boolean>>({});

    useEffect(() => {
        writeUsageHistory(usageHistory);
    }, [usageHistory]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const entries: Record<string, boolean> = {};
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (!key || !key.startsWith(TOOL_INTENT_PREFIX)) continue;
            const modelId = key.slice(TOOL_INTENT_PREFIX.length);
            const storedValue = window.localStorage.getItem(key);
            if (storedValue === 'true' || storedValue === 'false') {
                entries[modelId] = storedValue === 'true';
            }
        }
        if (Object.keys(entries).length > 0) {
            setToolIntentSettings((prev) => ({ ...entries, ...prev }));
        }
    }, []);

    const usageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const seed of SEED_MODELS) {
            counts[seed.id] = 10;
        }
        for (const entry of usageHistory) {
            counts[entry.modelId] = (counts[entry.modelId] ?? 0) + 1;
        }
        return counts;
    }, [usageHistory]);

    const getUsageCount = useCallback((modelId: string) => usageCounts[modelId] ?? 0, [usageCounts]);

    const getUsageScore = useCallback((modelId: string) => getUsageCount(modelId), [getUsageCount]);

    const setSelectedModel = useCallback((model: SelectedModel) => {
        setSelectedModelState(model);
    }, []);

    const recordModelUsage = useCallback((modelId: string) => {
        setUsageHistory((prev) => pruneHistory([...prev, { modelId, timestamp: Date.now() }]));
    }, []);

    const getToolIntentDefault = useCallback((modelId: string) => modelId.toLowerCase().includes('gemini'), []);

    const isToolIntentCheckEnabled = useCallback(
        (modelId: string) => {
            const stored = toolIntentSettings[modelId];
            if (typeof stored === 'boolean') {
                return stored;
            }
            return getToolIntentDefault(modelId);
        },
        [getToolIntentDefault, toolIntentSettings]
    );

    const setToolIntentCheckEnabled = useCallback((modelId: string, enabled: boolean) => {
        setToolIntentSettings((prev) => ({ ...prev, [modelId]: enabled }));
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(`${TOOL_INTENT_PREFIX}${modelId}`, String(enabled));
        } catch (error) {
            console.warn('[ModelSelection] Failed to persist tool intent preference', error);
        }
    }, []);

    const contextValue = useMemo(
        () => ({
            selectedModel,
            setSelectedModel,
            recordModelUsage,
            getUsageCount,
            getUsageScore,
            usageCounts,
            isToolIntentCheckEnabled,
            setToolIntentCheckEnabled,
        }),
        [
            getUsageCount,
            getUsageScore,
            selectedModel,
            setSelectedModel,
            recordModelUsage,
            usageCounts,
            isToolIntentCheckEnabled,
            setToolIntentCheckEnabled,
        ]
    );

    return (
        <ModelSelectionContext.Provider value={contextValue}>
            {children}
        </ModelSelectionContext.Provider>
    );
};

