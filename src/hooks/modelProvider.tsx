import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ModelContext, ModelContextValue, ModelSelection, ModelUsageCounts } from './modelProviderContext';

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

interface ModelUsageEvent {
    modelId: string;
    timestamp: number;
}

const USAGE_HISTORY_KEY = 'model_usage_history_v1';
const SELECTED_MODEL_KEY = 'model_selected_model_v1';
const ROLLING_WINDOW_MS = 72 * 60 * 60 * 1000;

const DEFAULT_MODEL_ID = 'google/gemini-2.5-pro';

const PRESEEDED_MODELS: ModelUsageCounts = {
    'openai/gpt-5': 10,
    'google/gemini-2.5-pro': 10,
    'anthropic/claude-sonnet-4.5': 10,
    'anthropic/claude-sonnet-4': 10,
    'anthropic/claude-opus-4.1': 10,
    'x-ai/grok-4-fast': 10,
};

const readUsageHistory = (): ModelUsageEvent[] => {
    if (!isBrowser) return [];
    try {
        const raw = window.localStorage.getItem(USAGE_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => ({
                modelId: typeof item.modelId === 'string' ? item.modelId : '',
                timestamp: typeof item.timestamp === 'number' ? item.timestamp : 0,
            }))
            .filter((item) => item.modelId && item.timestamp > 0);
    } catch (error) {
        console.warn('[ModelProvider] Failed to read usage history from local storage', error);
        return [];
    }
};

const writeUsageHistory = (events: ModelUsageEvent[]) => {
    if (!isBrowser) return;
    try {
        window.localStorage.setItem(USAGE_HISTORY_KEY, JSON.stringify(events));
    } catch (error) {
        console.warn('[ModelProvider] Failed to write usage history to local storage', error);
    }
};

const pruneHistory = (events: ModelUsageEvent[]): ModelUsageEvent[] => {
    const cutoff = Date.now() - ROLLING_WINDOW_MS;
    return events.filter((event) => event.timestamp >= cutoff);
};

const readSelectedModel = (): ModelSelection => {
    if (!isBrowser) {
        return { id: DEFAULT_MODEL_ID, name: DEFAULT_MODEL_ID };
    }
    try {
        const raw = window.localStorage.getItem(SELECTED_MODEL_KEY);
        if (!raw) {
            return { id: DEFAULT_MODEL_ID, name: DEFAULT_MODEL_ID };
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return { id: DEFAULT_MODEL_ID, name: DEFAULT_MODEL_ID };
        }
        const id = typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : DEFAULT_MODEL_ID;
        const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : id;
        return { id, name };
    } catch (error) {
        console.warn('[ModelProvider] Failed to parse selected model from local storage', error);
        return { id: DEFAULT_MODEL_ID, name: DEFAULT_MODEL_ID };
    }
};

const writeSelectedModel = (model: ModelSelection) => {
    if (!isBrowser) return;
    try {
        window.localStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(model));
    } catch (error) {
        console.warn('[ModelProvider] Failed to persist selected model to local storage', error);
    }
};

export const ModelProvider = ({ children }: { children: ReactNode }) => {
    const [usageHistory, setUsageHistory] = useState<ModelUsageEvent[]>(() => pruneHistory(readUsageHistory()));
    const [selectedModel, setSelectedModelState] = useState<ModelSelection>(() => readSelectedModel());

    useEffect(() => {
        writeUsageHistory(usageHistory);
    }, [usageHistory]);

    useEffect(() => {
        writeSelectedModel(selectedModel);
    }, [selectedModel]);

    const recordModelUsage = useCallback<ModelContextValue['recordModelUsage']>((modelId) => {
        if (!modelId) return;
        setUsageHistory((prev) => {
            const next = pruneHistory([...prev, { modelId, timestamp: Date.now() }]);
            return next;
        });
    }, []);

    const setSelectedModel = useCallback<ModelContextValue['setSelectedModel']>((model) => {
        if (!model.id) return;
        setSelectedModelState({ id: model.id, name: model.name && model.name.trim() ? model.name : model.id });
    }, []);

    const usageCounts = useMemo<ModelUsageCounts>(() => {
        const counts: ModelUsageCounts = { ...PRESEEDED_MODELS };
        for (const event of usageHistory) {
            counts[event.modelId] = (counts[event.modelId] ?? 0) + 1;
        }
        return counts;
    }, [usageHistory]);

    const contextValue = useMemo<ModelContextValue>(() => ({
        selectedModelId: selectedModel.id,
        selectedModelName: selectedModel.name ?? selectedModel.id,
        setSelectedModel,
        usageCounts,
        recordModelUsage,
    }), [recordModelUsage, selectedModel.id, selectedModel.name, setSelectedModel, usageCounts]);

    return <ModelContext.Provider value={contextValue}>{children}</ModelContext.Provider>;
};
