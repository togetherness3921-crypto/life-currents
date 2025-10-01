import { createContext } from 'react';

export interface SelectedModel {
    id: string;
    label?: string;
}

export interface ModelSelectionContextValue {
    selectedModel: SelectedModel;
    setSelectedModel: (model: SelectedModel) => void;
    recordModelUsage: (modelId: string) => void;
    getUsageCount: (modelId: string) => number;
    getUsageScore: (modelId: string) => number;
    usageCounts: Record<string, number>;
    getToolIntentCheck: (modelId: string) => boolean;
    setToolIntentCheck: (modelId: string, enabled: boolean) => void;
}

export const ModelSelectionContext = createContext<ModelSelectionContextValue | undefined>(undefined);

