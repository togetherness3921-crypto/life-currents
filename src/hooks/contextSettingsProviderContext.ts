import { createContext } from 'react';

export type ContextMode = 'last-8' | 'all-middle-out' | 'custom';

export interface ContextSettingsState {
    mode: ContextMode;
    customMessageCount: number;
}

export interface ContextSettingsContextValue {
    settings: ContextSettingsState;
    setMode: (mode: ContextMode) => void;
    setCustomMessageCount: (count: number) => void;
}

export const ContextSettingsContext = createContext<ContextSettingsContextValue | undefined>(undefined);
