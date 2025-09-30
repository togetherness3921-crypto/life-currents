import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
    ModelPreferenceContext,
    ModelPreferenceContextValue,
    SelectedModelState,
} from './modelPreferenceProviderContext';

const PREFERENCE_STORAGE_KEY = 'model_preference_state_v1';
const USAGE_STORAGE_KEY = 'model_usage_events_v1';
const ROLLING_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours
const SEEDED_MODELS: SelectedModelState[] = [
    { id: 'openai/gpt-5', label: 'openai/gpt-5' },
    { id: 'google/gemini-2.5-pro', label: 'google/gemini-2.5-pro' },
    { id: 'anthropic/claude-sonnet-4.5', label: 'anthropic/claude-sonnet-4.5' },
    { id: 'anthropic/claude-sonnet-4', label: 'anthropic/claude-sonnet-4' },
    { id: 'anthropic/claude-opus-4.1', label: 'anthropic/claude-opus-4.1' },
    { id: 'x-ai/grok-4-fast', label: 'x-ai/grok-4-fast' },
];
const SEED_USAGE_WEIGHT = 10;

type UsageEvent = {
    modelId: string;
    timestamp: number;
};

type StoredPreference = SelectedModelState | null;

type ModelPreferenceProviderProps = {
    children: ReactNode;
};

const filterOldEvents = (events: UsageEvent[]): UsageEvent[] => {
    const cutoff = Date.now() - ROLLING_WINDOW_MS;
    return events.filter((event) => event.timestamp >= cutoff);
};

export const ModelPreferenceProvider = ({ children }: ModelPreferenceProviderProps) => {
    const [selectedModel, setSelectedModelState] = useState<StoredPreference>(() => {
        try {
            const raw = localStorage.getItem(PREFERENCE_STORAGE_KEY);
            if (raw) {
                const parsed: StoredPreference = JSON.parse(raw);
                if (parsed && typeof parsed.id === 'string' && typeof parsed.label === 'string') {
                    return parsed;
                }
            }
        } catch (error) {
            console.warn('[ModelPreferenceProvider] Failed to read stored preference', error);
        }
        return SEEDED_MODELS[0];
    });

    const [usageEvents, setUsageEvents] = useState<UsageEvent[]>(() => {
        try {
            const raw = localStorage.getItem(USAGE_STORAGE_KEY);
            if (!raw) return [];
            const parsed: UsageEvent[] = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return filterOldEvents(parsed);
        } catch (error) {
            console.warn('[ModelPreferenceProvider] Failed to parse usage events', error);
            return [];
        }
    });

    useEffect(() => {
        try {
            if (selectedModel) {
                localStorage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(selectedModel));
            } else {
                localStorage.removeItem(PREFERENCE_STORAGE_KEY);
            }
        } catch (error) {
            console.warn('[ModelPreferenceProvider] Failed to persist preference', error);
        }
    }, [selectedModel]);

    useEffect(() => {
        const filtered = filterOldEvents(usageEvents);
        if (filtered.length !== usageEvents.length) {
            setUsageEvents(filtered);
            return;
        }

        try {
            localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(filtered));
        } catch (error) {
            console.warn('[ModelPreferenceProvider] Failed to persist usage', error);
        }
    }, [usageEvents]);

    const usageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const event of usageEvents) {
            counts[event.modelId] = (counts[event.modelId] ?? 0) + 1;
        }
        for (const model of SEEDED_MODELS) {
            counts[model.id] = (counts[model.id] ?? 0) + SEED_USAGE_WEIGHT;
        }
        return counts;
    }, [usageEvents]);

    const setSelectedModel = useCallback<ModelPreferenceContextValue['setSelectedModel']>((model) => {
        setSelectedModelState(model);
    }, []);

    const recordModelUsage = useCallback<ModelPreferenceContextValue['recordModelUsage']>((modelId) => {
        setUsageEvents((prev) => {
            const next = filterOldEvents([...prev, { modelId, timestamp: Date.now() }]);
            return next;
        });
    }, []);

    const value: ModelPreferenceContextValue = useMemo(
        () => ({
            selectedModel,
            setSelectedModel,
            recordModelUsage,
            usageCounts,
        }),
        [selectedModel, setSelectedModel, recordModelUsage, usageCounts]
    );

    return <ModelPreferenceContext.Provider value={value}>{children}</ModelPreferenceContext.Provider>;
};

export default ModelPreferenceProvider;
