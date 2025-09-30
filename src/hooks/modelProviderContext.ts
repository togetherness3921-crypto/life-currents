import { createContext } from 'react';

export interface ModelSelection {
    id: string;
    name?: string;
}

export interface ModelUsageCounts {
    [modelId: string]: number;
}

export interface ModelContextValue {
    selectedModelId: string;
    selectedModelName: string;
    setSelectedModel: (model: ModelSelection) => void;
    usageCounts: ModelUsageCounts;
    recordModelUsage: (modelId: string) => void;
}

export const ModelContext = createContext<ModelContextValue | undefined>(undefined);
