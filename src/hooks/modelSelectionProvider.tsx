import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ModelSelectionContext, SelectedModel } from './modelSelectionProviderContext';

// Usage is tracked using a rolling window approximation. For simplicity we store
// timestamps in localStorage and prune entries beyond 72h when accessed.

const STORAGE_KEY = 'model_usage_history_v1';
const INTENT_PREFIX = 'tool_intent_check_';
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

const getDefaultIntentCheck = (modelId: string): boolean => modelId.toLowerCase().includes('gemini');

const readIntentCheck = (modelId: string): boolean => {
    const defaultValue = getDefaultIntentCheck(modelId);
    if (typeof window === 'undefined') return defaultValue;
    const key = `${INTENT_PREFIX}${modelId}`;
    const stored = window.localStorage.getItem(key);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    try {
        window.localStorage.setItem(key, defaultValue ? 'true' : 'false');
    } catch (error) {
        console.warn('[ModelSelection] Failed to persist default tool intent preference', error);
    }
    return defaultValue;
};

const writeIntentCheck = (modelId: string, enabled: boolean) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(`${INTENT_PREFIX}${modelId}`, enabled ? 'true' : 'false');
    } catch (error) {
        console.warn('[ModelSelection] Failed to persist tool intent preference', error);
    }
};

export const ModelSelectionProvider = ({ children }: { children: ReactNode }) => {
    const [selectedModel, setSelectedModelState] = useState<SelectedModel>(() => SEED_MODELS[1]);
    const [usageHistory, setUsageHistory] = useState<UsageHistoryEntry[]>(() => pruneHistory(readUsageHistory()));
    const [intentChecks, setIntentChecks] = useState<Record<string, boolean>>(() => {
        const entries: Record<string, boolean> = {};
        for (const seed of SEED_MODELS) {
            entries[seed.id] = readIntentCheck(seed.id);
        }
        return entries;
    });

    useEffect(() => {
        writeUsageHistory(usageHistory);
    }, [usageHistory]);

    const ensureIntentEntry = useCallback((modelId: string) => {
        setIntentChecks((prev) => {
            if (prev[modelId] !== undefined) {
                return prev;
            }
            const nextValue = readIntentCheck(modelId);
            if (prev[modelId] === nextValue) {
                return prev;
            }
            return { ...prev, [modelId]: nextValue };
        });
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
        ensureIntentEntry(model.id);
        setSelectedModelState(model);
    }, [ensureIntentEntry]);

    const recordModelUsage = useCallback((modelId: string) => {
        setUsageHistory((prev) => pruneHistory([...prev, { modelId, timestamp: Date.now() }]));
    }, []);

    const isToolIntentCheckEnabled = useCallback(
        (modelId: string) => {
            const value = intentChecks[modelId];
            if (value === undefined) {
                return readIntentCheck(modelId);
            }
            return value;
        },
        [intentChecks]
    );

    const setToolIntentCheck = useCallback((modelId: string, enabled: boolean) => {
        writeIntentCheck(modelId, enabled);
        setIntentChecks((prev) => {
            if (prev[modelId] === enabled) {
                return prev;
            }
            return { ...prev, [modelId]: enabled };
        });
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
            setToolIntentCheck,
        }),
        [
            getUsageCount,
            getUsageScore,
            selectedModel,
            setSelectedModel,
            recordModelUsage,
            usageCounts,
            isToolIntentCheckEnabled,
            setToolIntentCheck,
        ]
    );

    return (
        <ModelSelectionContext.Provider value={contextValue}>
            {children}
        </ModelSelectionContext.Provider>
    );
};

