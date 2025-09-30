import type { ModelOption } from '@/types/models';

const MODEL_USAGE_STORAGE_KEY = 'chat_model_usage_history';
export const SELECTED_MODEL_STORAGE_KEY = 'chat_selected_model';
const ROLLING_WINDOW_HOURS = 72;
const ROLLING_WINDOW_MS = ROLLING_WINDOW_HOURS * 60 * 60 * 1000;
export const PRESEEDED_USAGE_COUNT = 10;

export const PRESEEDED_MODELS: Record<string, string> = {
    'openai/gpt-5': 'OpenAI GPT-5',
    'google/gemini-2.5-pro': 'Google Gemini 2.5 Pro',
    'anthropic/claude-sonnet-4.5': 'Anthropic Claude Sonnet 4.5',
    'anthropic/claude-sonnet-4': 'Anthropic Claude Sonnet 4',
    'anthropic/claude-opus-4.1': 'Anthropic Claude Opus 4.1',
    'x-ai/grok-4-fast': 'xAI Grok 4 Fast',
};

export const DEFAULT_MODEL: ModelOption = {
    id: 'openai/gpt-5',
    name: PRESEEDED_MODELS['openai/gpt-5'],
};

type UsageHistory = Record<string, number[]>;

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readUsageHistory = (): UsageHistory => {
    if (!isBrowser) return {};
    try {
        const stored = window.localStorage.getItem(MODEL_USAGE_STORAGE_KEY);
        if (!stored) return {};
        const parsed = JSON.parse(stored) as UsageHistory;
        Object.keys(parsed).forEach((key) => {
            parsed[key] = Array.isArray(parsed[key])
                ? parsed[key].map((value) => Number(value)).filter((value) => !Number.isNaN(value))
                : [];
        });
        return parsed;
    } catch (error) {
        console.warn('Failed to read model usage history:', error);
        return {};
    }
};

const writeUsageHistory = (history: UsageHistory) => {
    if (!isBrowser) return;
    try {
        window.localStorage.setItem(MODEL_USAGE_STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.warn('Failed to persist model usage history:', error);
    }
};

const pruneHistory = (history: UsageHistory): UsageHistory => {
    const cutoff = Date.now() - ROLLING_WINDOW_MS;
    const pruned: UsageHistory = {};

    Object.entries(history).forEach(([modelId, timestamps]) => {
        const recent = timestamps.filter((timestamp) => timestamp >= cutoff);
        if (recent.length > 0) {
            pruned[modelId] = recent;
        }
    });

    return pruned;
};

export const recordModelUsage = (modelId: string, timestamp: number = Date.now()) => {
    if (!isBrowser) return;
    const history = readUsageHistory();
    const updated = { ...history };
    const existing = updated[modelId] ?? [];
    updated[modelId] = [...existing, timestamp];
    const pruned = pruneHistory(updated);
    writeUsageHistory(pruned);
};

export const getUsageCounts = (): Record<string, number> => {
    if (!isBrowser) return {};
    const history = pruneHistory(readUsageHistory());
    writeUsageHistory(history);

    const result: Record<string, number> = {};
    Object.entries(history).forEach(([modelId, timestamps]) => {
        result[modelId] = timestamps.length;
    });

    Object.keys(PRESEEDED_MODELS).forEach((modelId) => {
        result[modelId] = (result[modelId] ?? 0) + PRESEEDED_USAGE_COUNT;
    });

    return result;
};

export const getDisplayNameForModel = (model: ModelOption | string): string => {
    const modelId = typeof model === 'string' ? model : model.id;
    if (typeof model !== 'string' && model.name) {
        return model.name;
    }
    return PRESEEDED_MODELS[modelId] ?? modelId;
};
