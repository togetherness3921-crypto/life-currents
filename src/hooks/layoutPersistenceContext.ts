import { createContext } from 'react';

export interface LayoutBorderState {
    axis: 'x' | 'y';
    position: number;
}

export interface LayoutPersistenceValue {
    ready: boolean;
    borders: Record<string, LayoutBorderState>;
    setBorderPosition: (borderId: string, axis: 'x' | 'y', position: number) => Promise<void>;
    refresh: () => Promise<void>;
}

export const LayoutPersistenceContext = createContext<LayoutPersistenceValue | undefined>(undefined);
