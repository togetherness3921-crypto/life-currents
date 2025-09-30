import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
    ContextMode,
    ContextSettingsContext,
    ContextSettingsContextValue,
    ContextSettingsState,
} from './contextSettingsProviderContext';

const STORAGE_KEY = 'chat_context_settings_v1';
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const DEFAULT_STATE: ContextSettingsState = {
    mode: 'all-middle-out',
    customMessageCount: 20,
};

const clampCount = (value: number) => {
    if (Number.isNaN(value) || value < 1) return 1;
    if (value > 200) return 200;
    return Math.round(value);
};

const readState = (): ContextSettingsState => {
    if (!isBrowser) return DEFAULT_STATE;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_STATE;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE;
        const mode = parsed.mode as ContextMode | undefined;
        const customMessageCount = clampCount(Number(parsed.customMessageCount ?? DEFAULT_STATE.customMessageCount));
        if (mode === 'last-8' || mode === 'all-middle-out' || mode === 'custom') {
            return { mode, customMessageCount };
        }
        return { ...DEFAULT_STATE, customMessageCount };
    } catch (error) {
        console.warn('[ContextSettings] Failed to parse state from localStorage', error);
        return DEFAULT_STATE;
    }
};

const writeState = (state: ContextSettingsState) => {
    if (!isBrowser) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('[ContextSettings] Failed to persist state to localStorage', error);
    }
};

export const ContextSettingsProvider = ({ children }: { children: ReactNode }) => {
    const [settings, setSettings] = useState<ContextSettingsState>(() => readState());

    useEffect(() => {
        writeState(settings);
    }, [settings]);

    const setMode = useCallback<ContextSettingsContextValue['setMode']>((mode) => {
        setSettings((prev) => {
            if (prev.mode === mode) return prev;
            return { ...prev, mode };
        });
    }, []);

    const setCustomMessageCount = useCallback<ContextSettingsContextValue['setCustomMessageCount']>((count) => {
        const nextCount = clampCount(count);
        setSettings((prev) => ({
            ...prev,
            mode: 'custom',
            customMessageCount: nextCount,
        }));
    }, []);

    const value = useMemo<ContextSettingsContextValue>(() => ({
        settings,
        setMode,
        setCustomMessageCount,
    }), [setCustomMessageCount, setMode, settings]);

    return <ContextSettingsContext.Provider value={value}>{children}</ContextSettingsContext.Provider>;
};
