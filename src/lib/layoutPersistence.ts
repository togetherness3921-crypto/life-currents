import { LayoutBorderState } from '@/hooks/layoutPersistenceContext';
import { getDefaultBorder } from '@/constants/layout';

const MIN_GAP = 0.05;

export const computeLayoutFromBorders = (
    handleIds: string[],
    borders: Record<string, LayoutBorderState>
): number[] => {
    if (handleIds.length === 0) {
        return [100];
    }

    const handles = handleIds.map((id, index) => {
        const fallback = getDefaultBorder(id)?.position ?? ((index + 1) / (handleIds.length + 1));
        const stored = borders[id]?.position;
        return typeof stored === 'number' ? stored : fallback;
    });

    const safeHandles: number[] = [];
    let previous = 0;
    handles.forEach((value, index) => {
        const fallback = handles[index];
        const remaining = handleIds.length - index - 1;
        const minAllowed = previous + MIN_GAP;
        const maxAllowed = 1 - MIN_GAP * (remaining + 1);
        const next = Math.min(Math.max(value ?? fallback, minAllowed), Math.max(minAllowed, maxAllowed));
        safeHandles.push(next);
        previous = next;
    });

    const fractions: number[] = [];
    let last = 0;
    safeHandles.forEach((value) => {
        fractions.push(Math.max(MIN_GAP, value - last));
        last = value;
    });
    fractions.push(Math.max(MIN_GAP, 1 - last));

    const total = fractions.reduce((sum, part) => sum + part, 0) || 1;
    return fractions.map((part) => (part / total) * 100);
};

export const persistLayoutToBorders = async (
    layout: number[],
    handleIds: string[],
    axis: 'x' | 'y',
    setBorderPosition: (borderId: string, axis: 'x' | 'y', position: number) => Promise<void>
) => {
    const total = layout.reduce((sum, size) => sum + size, 0) || 100;
    let cumulative = 0;
    await Promise.all(
        handleIds.map((borderId, index) => {
            cumulative += layout[index] ?? 0;
            const position = cumulative / total;
            return setBorderPosition(borderId, axis, position);
        })
    );
};
