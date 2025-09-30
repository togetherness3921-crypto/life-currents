import { createContext } from 'react';

export type ConversationContextMode = 'last8' | 'all' | 'custom';

export interface ConversationContextState {
    mode: ConversationContextMode;
    customMessageCount: number;
}

export interface ConversationContextValue extends ConversationContextState {
    setMode: (mode: ConversationContextMode) => void;
    setCustomMessageCount: (count: number) => void;
}

export const ConversationContext = createContext<ConversationContextValue | undefined>(undefined);
