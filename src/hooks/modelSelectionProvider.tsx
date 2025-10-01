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

const readToolIntentPreference = (modelId: string): boolean => {
    if (typeof window === 'undefined') {
        return modelId.toLowerCase().includes('gemini');
    }
    try {
        const stored = window.localStorage.getItem(`${TOOL_INTENT_PREFIX}${modelId}`);
        if (stored === null) {
            return modelId.toLowerCase().includes('gemini');
        }
        return stored === 'true';
    } catch (error) {
        console.warn('[ModelSelection] Failed to read tool intent preference', error);
        return modelId.toLowerCase().includes('gemini');
    }
};

const writeToolIntentPreference = (modelId: string, enabled: boolean) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(`${TOOL_INTENT_PREFIX}${modelId}`, enabled ? 'true' : 'false');
    } catch (error) {
        console.warn('[ModelSelection] Failed to write tool intent preference', error);
    }
};

export const ModelSelectionProvider = ({ children }: { children: ReactNode }) => {
    const [selectedModel, setSelectedModelState] = useState<SelectedModel>(() => SEED_MODELS[1]);
    const [usageHistory, setUsageHistory] = useState<UsageHistoryEntry[]>(() => pruneHistory(readUsageHistory()));
    const [toolIntentOverrides, setToolIntentOverrides] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {};
        for (const seed of SEED_MODELS) {
            initial[seed.id] = readToolIntentPreference(seed.id);
        }
        return initial;
    });

    useEffect(() => {
        writeUsageHistory(usageHistory);
    }, [usageHistory]);

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

    const isToolIntentCheckEnabled = useCallback(
        (modelId: string) => {
            const override = toolIntentOverrides[modelId];
            if (typeof override === 'boolean') {
                return override;
            }
            return readToolIntentPreference(modelId);
        },
        [toolIntentOverrides]
    );

    const setToolIntentCheckEnabled = useCallback((modelId: string, enabled: boolean) => {
        setToolIntentOverrides((prev) => ({ ...prev, [modelId]: enabled }));
        writeToolIntentPreference(modelId, enabled);
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

