import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
    ContextSettingsContext,
    ContextSettingsContextValue,
    ContextMode,
    DEFAULT_CUSTOM_MESSAGE_COUNT,
    MAX_CUSTOM_MESSAGE_COUNT,
    MIN_CUSTOM_MESSAGE_COUNT,
} from './contextSettingsProviderContext';

const STORAGE_KEY = 'chat_context_settings_v1';
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

interface StoredSettings {
    mode?: ContextMode;
    customMessageCount?: number;
}

const clampCustomCount = (value: number | undefined): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return DEFAULT_CUSTOM_MESSAGE_COUNT;
    }
    const rounded = Math.round(value);
    if (rounded < MIN_CUSTOM_MESSAGE_COUNT) return MIN_CUSTOM_MESSAGE_COUNT;
    if (rounded > MAX_CUSTOM_MESSAGE_COUNT) return MAX_CUSTOM_MESSAGE_COUNT;
    return rounded;
};

const readStoredSettings = (): { mode: ContextMode; customMessageCount: number } => {
    if (!isBrowser) {
        return { mode: 'all-middle-out', customMessageCount: DEFAULT_CUSTOM_MESSAGE_COUNT };
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { mode: 'all-middle-out', customMessageCount: DEFAULT_CUSTOM_MESSAGE_COUNT };
        }
        const parsed: StoredSettings = JSON.parse(raw);
        const mode: ContextMode = parsed.mode === 'last8' || parsed.mode === 'custom' || parsed.mode === 'all-middle-out'
            ? parsed.mode
            : 'all-middle-out';
        const customMessageCount = clampCustomCount(parsed.customMessageCount);
        return { mode, customMessageCount };
    } catch (error) {
        console.warn('[ContextSettings] Failed to parse stored settings', error);
        return { mode: 'all-middle-out', customMessageCount: DEFAULT_CUSTOM_MESSAGE_COUNT };
    }
};

export const ContextSettingsProvider = ({ children }: { children: ReactNode }) => {
    const stored = useMemo(() => readStoredSettings(), []);
    const [mode, setModeState] = useState<ContextMode>(stored.mode);
    const [customMessageCount, setCustomMessageCountState] = useState<number>(stored.customMessageCount);

    useEffect(() => {
        if (!isBrowser) return;
        const payload: StoredSettings = {
            mode,
            customMessageCount,
        };
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (error) {
            console.warn('[ContextSettings] Failed to persist settings', error);
        }
    }, [mode, customMessageCount]);

    const setMode = useCallback<ContextSettingsContextValue['setMode']>((nextMode) => {
        setModeState(nextMode);
    }, []);

    const setCustomMessageCount = useCallback<ContextSettingsContextValue['setCustomMessageCount']>((count) => {
        const clamped = clampCustomCount(count);
        setCustomMessageCountState(clamped);
    }, []);

    const value = useMemo<ContextSettingsContextValue>(() => ({
        mode,
        customMessageCount,
        setMode,
        setCustomMessageCount,
    }), [mode, customMessageCount, setMode, setCustomMessageCount]);

    return <ContextSettingsContext.Provider value={value}>{children}</ContextSettingsContext.Provider>;
};
