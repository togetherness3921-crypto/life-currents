import React, { PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import {
    DEFAULT_MODEL_ID,
    MODEL_USAGE_WINDOW_MS,
    ModelSelectionContext,
    ModelUsageRecords,
    PRESEEDED_MODEL_USAGE,
    SelectedModelState,
} from './modelSelectionProviderContext';

const SELECTED_MODEL_STORAGE_KEY = 'life-currents:selected-model';
const MODEL_USAGE_STORAGE_KEY = 'life-currents:model-usage-records';

type StoredSelectedModel = SelectedModelState | string | null;

type SerializableUsageRecords = Record<string, number[]>;

const loadSelectedModel = (): SelectedModelState => {
    if (typeof window === 'undefined') {
        return { id: DEFAULT_MODEL_ID };
    }

    const raw = window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
    if (!raw) {
        return { id: DEFAULT_MODEL_ID };
    }

    try {
        const parsed: StoredSelectedModel = JSON.parse(raw);
        if (typeof parsed === 'string') {
            return { id: parsed };
        }
        if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
            return { id: parsed.id, label: typeof parsed.label === 'string' ? parsed.label : undefined };
        }
    } catch (error) {
        console.warn('[ModelSelectionProvider] Failed to parse stored model preference', error);
    }

    return { id: DEFAULT_MODEL_ID };
};

const pruneUsageRecords = (records: SerializableUsageRecords): SerializableUsageRecords => {
    const now = Date.now();
    return Object.entries(records).reduce<SerializableUsageRecords>((acc, [modelId, timestamps]) => {
        const pruned = timestamps.filter((timestamp) => now - timestamp <= MODEL_USAGE_WINDOW_MS);
        if (pruned.length > 0) {
            acc[modelId] = pruned;
        }
        return acc;
    }, {});
};

const loadUsageRecords = (): SerializableUsageRecords => {
    if (typeof window === 'undefined') {
        return {};
    }

    const raw = window.localStorage.getItem(MODEL_USAGE_STORAGE_KEY);
    if (!raw) {
        return {};
    }

    try {
        const parsed = JSON.parse(raw) as SerializableUsageRecords;
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }
        return pruneUsageRecords(parsed);
    } catch (error) {
        console.warn('[ModelSelectionProvider] Failed to parse stored usage records', error);
        return {};
    }
};

export const ModelSelectionProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const [selectedModelState, setSelectedModelState] = useState<SelectedModelState>(() => loadSelectedModel());
    const [usageRecords, setUsageRecords] = useState<ModelUsageRecords>(() => loadUsageRecords());

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, JSON.stringify(selectedModelState));
    }, [selectedModelState]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(MODEL_USAGE_STORAGE_KEY, JSON.stringify(usageRecords));
    }, [usageRecords]);

    const selectModel = useCallback((modelId: string, options?: { label?: string }) => {
        setSelectedModelState({ id: modelId, label: options?.label });
    }, []);

    const recordModelUsage = useCallback((modelId: string) => {
        setUsageRecords((previous) => {
            const now = Date.now();
            const existing = previous[modelId] ?? [];
            const pruned = existing.filter((timestamp) => now - timestamp <= MODEL_USAGE_WINDOW_MS);
            return {
                ...previous,
                [modelId]: [...pruned, now],
            };
        });
    }, []);

    const getUsageScore = useCallback(
        (modelId: string) => {
            const now = Date.now();
            const timestamps = usageRecords[modelId] ?? [];
            const recentCount = timestamps.filter((timestamp) => now - timestamp <= MODEL_USAGE_WINDOW_MS).length;
            const base = PRESEEDED_MODEL_USAGE[modelId] ?? 0;
            return base + recentCount;
        },
        [usageRecords]
    );

    const contextValue = useMemo(
        () => ({
            selectedModel: selectedModelState.id,
            selectedModelLabel: selectedModelState.label,
            selectModel,
            recordModelUsage,
            getUsageScore,
            usageRecords,
        }),
        [getUsageScore, recordModelUsage, selectModel, selectedModelState.id, selectedModelState.label, usageRecords]
    );

    return <ModelSelectionContext.Provider value={contextValue}>{children}</ModelSelectionContext.Provider>;
};

