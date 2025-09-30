import { createContext } from 'react';

export const MODEL_USAGE_WINDOW_HOURS = 72;
export const MODEL_USAGE_WINDOW_MS = MODEL_USAGE_WINDOW_HOURS * 60 * 60 * 1000;

export const DEFAULT_MODEL_ID = 'google/gemini-2.5-pro';

export const PRESEEDED_MODEL_USAGE: Record<string, number> = {
    'openai/gpt-5': 10,
    'google/gemini-2.5-pro': 10,
    'anthropic/claude-sonnet-4.5': 10,
    'anthropic/claude-sonnet-4': 10,
    'anthropic/claude-opus-4.1': 10,
    'x-ai/grok-4-fast': 10,
};

export interface ModelUsageRecords {
    [modelId: string]: number[];
}

export interface SelectedModelState {
    id: string;
    label?: string;
}

export interface ModelSelectionContextValue {
    selectedModel: string;
    selectedModelLabel?: string;
    selectModel: (modelId: string, options?: { label?: string }) => void;
    recordModelUsage: (modelId: string) => void;
    getUsageScore: (modelId: string) => number;
    usageRecords: ModelUsageRecords;
}

export const ModelSelectionContext = createContext<ModelSelectionContextValue | undefined>(undefined);

