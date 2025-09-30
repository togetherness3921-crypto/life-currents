import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
    ConversationContextMode,
    ConversationContextSettingsContext,
    ConversationContextSettingsValue,
} from './conversationContextProviderContext';

const LOCAL_STORAGE_KEY = 'conversation_context_settings_v1';
const DEFAULT_MODE: ConversationContextMode = 'all-middle-out';
const DEFAULT_CUSTOM_COUNT = 20;
const CUSTOM_MIN = 1;
const CUSTOM_MAX = 200;

interface StoredSettings {
    mode: ConversationContextMode;
    customMessageCount: number;
}

const clampCustomCount = (value: number) => {
    if (Number.isNaN(value)) return DEFAULT_CUSTOM_COUNT;
    return Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(value)));
};

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const readStoredSettings = (): StoredSettings => {
    if (!isBrowser) {
        return { mode: DEFAULT_MODE, customMessageCount: DEFAULT_CUSTOM_COUNT };
    }

    try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) {
            return { mode: DEFAULT_MODE, customMessageCount: DEFAULT_CUSTOM_COUNT };
        }
        const parsed = JSON.parse(raw) as Partial<StoredSettings>;
        const mode = parsed.mode ?? DEFAULT_MODE;
        const customMessageCount = clampCustomCount(parsed.customMessageCount ?? DEFAULT_CUSTOM_COUNT);
        return { mode, customMessageCount };
    } catch (error) {
        console.warn('[ConversationContext] Failed to read settings from local storage', error);
        return { mode: DEFAULT_MODE, customMessageCount: DEFAULT_CUSTOM_COUNT };
    }
};

const writeStoredSettings = (settings: StoredSettings) => {
    if (!isBrowser) return;
    try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn('[ConversationContext] Failed to persist settings to local storage', error);
    }
};

export const ConversationContextProvider = ({ children }: { children: ReactNode }) => {
    const [mode, setModeState] = useState<ConversationContextMode>(() => readStoredSettings().mode);
    const [customMessageCount, setCustomMessageCountState] = useState<number>(() => readStoredSettings().customMessageCount);

    useEffect(() => {
        writeStoredSettings({ mode, customMessageCount });
    }, [mode, customMessageCount]);

    const setMode = useCallback((nextMode: ConversationContextMode) => {
        setModeState(nextMode);
    }, []);

    const setCustomMessageCount = useCallback((value: number) => {
        setCustomMessageCountState(clampCustomCount(value));
    }, []);

    const applyContextToMessages = useCallback<ConversationContextSettingsValue['applyContextToMessages']>(
        (messages) => {
            if (!Array.isArray(messages) || messages.length === 0) {
                return [];
            }

            if (mode === 'all-middle-out') {
                return [...messages];
            }

            const limit = mode === 'last-8' ? 8 : clampCustomCount(customMessageCount);
            if (limit >= messages.length) {
                return [...messages];
            }
            return messages.slice(messages.length - limit);
        },
        [customMessageCount, mode]
    );

    const transforms = useMemo(() => (mode === 'all-middle-out' ? ['middle-out'] : []), [mode]);

    const value = useMemo<ConversationContextSettingsValue>(
        () => ({
            mode,
            setMode,
            customMessageCount,
            setCustomMessageCount,
            applyContextToMessages,
            transforms,
        }),
        [applyContextToMessages, customMessageCount, mode, setMode, setCustomMessageCount, transforms]
    );

    return (
        <ConversationContextSettingsContext.Provider value={value}>
            {children}
        </ConversationContextSettingsContext.Provider>
    );
};
