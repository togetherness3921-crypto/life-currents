import { createContext } from 'react';

export interface SelectedModelState {
    id: string;
    label: string;
}

export interface ModelPreferenceContextValue {
    selectedModel: SelectedModelState | null;
    setSelectedModel: (model: SelectedModelState) => void;
    recordModelUsage: (modelId: string) => void;
    usageCounts: Record<string, number>;
}

export const ModelPreferenceContext = createContext<ModelPreferenceContextValue | undefined>(undefined);
