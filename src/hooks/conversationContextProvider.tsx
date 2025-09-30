import { ReactNode, useCallback, useMemo, useState, useEffect } from 'react';
import {
    ConversationContext,
    ConversationContextMode,
    ConversationContextState,
    ConversationContextValue,
} from './conversationContextProviderContext';

const STORAGE_KEY = 'chat_conversation_context_v1';
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const clampCount = (value: number) => {
    if (Number.isNaN(value)) return 1;
    return Math.max(1, Math.round(value));
};

const readStoredState = (): ConversationContextState => {
    if (!isBrowser) {
        return { mode: 'all', customMessageCount: 20 };
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { mode: 'all', customMessageCount: 20 };
        }
        const parsed = JSON.parse(raw);
        if (!parsed || (parsed.mode !== 'last8' && parsed.mode !== 'all' && parsed.mode !== 'custom')) {
            return { mode: 'all', customMessageCount: 20 };
        }
        const count = clampCount(typeof parsed.customMessageCount === 'number' ? parsed.customMessageCount : 20);
        return { mode: parsed.mode as ConversationContextMode, customMessageCount: count };
    } catch (error) {
        console.warn('[ConversationContext] Failed to read settings from local storage', error);
        return { mode: 'all', customMessageCount: 20 };
    }
};

export const ConversationContextProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<ConversationContextState>(() => readStoredState());

    useEffect(() => {
        if (!isBrowser) return;
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.warn('[ConversationContext] Failed to persist settings to local storage', error);
        }
    }, [state]);

    const setMode = useCallback((mode: ConversationContextMode) => {
        setState((prev) => {
            if (prev.mode === mode) return prev;
            return { ...prev, mode };
        });
    }, []);

    const setCustomMessageCount = useCallback((count: number) => {
        const clamped = clampCount(count);
        setState((prev) => {
            if (prev.customMessageCount === clamped) return prev;
            return { ...prev, customMessageCount: clamped };
        });
    }, []);

    const value = useMemo<ConversationContextValue>(() => ({
        mode: state.mode,
        customMessageCount: state.customMessageCount,
        setMode,
        setCustomMessageCount,
    }), [setMode, setCustomMessageCount, state.customMessageCount, state.mode]);

    return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
};
