import { useContext } from 'react';
import { ContextSettingsContext } from './contextSettingsProviderContext';

export const useContextSettings = () => {
    const context = useContext(ContextSettingsContext);
    if (!context) {
        throw new Error('useContextSettings must be used within a ContextSettingsProvider');
    }
    return context;
};

export type { ContextMode, ContextSettingsState } from './contextSettingsProviderContext';
