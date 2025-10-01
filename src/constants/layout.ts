import { LayoutBorderState } from '@/hooks/layoutPersistenceContext';

export const DEFAULT_LAYOUT_BORDERS: Record<string, LayoutBorderState> = {
    'main-horizontal-1': { axis: 'x', position: 0.7 },
    'main-horizontal-2': { axis: 'x', position: 0.85 },
    'main-vertical-1': { axis: 'y', position: 0.65 },
    'main-vertical-2': { axis: 'y', position: 0.8 },
    'progress-horizontal-1': { axis: 'x', position: 0.75 },
    'chat-horizontal-1': { axis: 'x', position: 0.2 },
};

export const getDefaultBorder = (borderId: string): LayoutBorderState | undefined =>
    DEFAULT_LAYOUT_BORDERS[borderId];
