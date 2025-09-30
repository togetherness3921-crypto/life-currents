import { createContext } from 'react';

export type ContextMode = 'last8' | 'all-middle-out' | 'custom';

export interface ContextSettingsContextValue {
    mode: ContextMode;
    customMessageCount: number;
    setMode: (mode: ContextMode) => void;
    setCustomMessageCount: (count: number) => void;
}

export const MIN_CUSTOM_MESSAGE_COUNT = 1;
export const MAX_CUSTOM_MESSAGE_COUNT = 200;
export const DEFAULT_CUSTOM_MESSAGE_COUNT = 20;

export const ContextSettingsContext = createContext<ContextSettingsContextValue | undefined>(undefined);
