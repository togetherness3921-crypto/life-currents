import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_LAYOUT_BORDERS, getDefaultBorder } from '@/constants/layout';
import { LayoutBorderState, LayoutPersistenceContext } from './layoutPersistenceContext';

interface LayoutPersistenceProviderProps {
    children: ReactNode;
    initialDefaults?: Record<string, LayoutBorderState>;
}

const EPSILON = 0.001;

export const LayoutPersistenceProvider = ({ children, initialDefaults = DEFAULT_LAYOUT_BORDERS }: LayoutPersistenceProviderProps) => {
    const [ready, setReady] = useState(false);
    const [borders, setBorders] = useState<Record<string, LayoutBorderState>>(initialDefaults);
    const initialDefaultsRef = useRef(initialDefaults);
    const pendingSaveRef = useRef<Record<string, number>>({});

    const refresh = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('layout_borders')
                .select('border_id, axis, position');
            if (error) throw error;

            const fetched: Record<string, LayoutBorderState> = {};
            data?.forEach((row: { border_id: string; axis: 'x' | 'y'; position: number }) => {
                if (!row?.border_id) return;
                const fallback = getDefaultBorder(row.border_id) ?? initialDefaultsRef.current[row.border_id];
                fetched[row.border_id] = {
                    axis: row.axis ?? fallback?.axis ?? 'x',
                    position:
                        typeof row.position === 'number'
                            ? row.position
                            : fallback?.position ?? 0.5,
                };
            });

            setBorders((prev) => ({
                ...initialDefaultsRef.current,
                ...prev,
                ...fetched,
            }));
        } catch (error) {
            console.error('[LayoutPersistence] Failed to load layout_borders', error);
        } finally {
            setReady(true);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const setBorderPosition = useCallback<
        (borderId: string, axis: 'x' | 'y', position: number) => Promise<void>
    >(async (borderId, axis, position) => {
        if (!borderId) return;
        const clampedPosition = Math.max(0, Math.min(1, position));
        const existing = borders[borderId];
        if (existing && Math.abs(existing.position - clampedPosition) < EPSILON && existing.axis === axis) {
            return;
        }

        setBorders((prev) => ({
            ...prev,
            [borderId]: { axis, position: clampedPosition },
        }));

        pendingSaveRef.current[borderId] = clampedPosition;

        try {
            const { error } = await supabase
                .from('layout_borders')
                .upsert({
                    border_id: borderId,
                    axis,
                    position: clampedPosition,
                });
            if (error) throw error;
            if (Math.abs((pendingSaveRef.current[borderId] ?? clampedPosition) - clampedPosition) < EPSILON) {
                delete pendingSaveRef.current[borderId];
            }
        } catch (error) {
            console.error('[LayoutPersistence] Failed to persist border', borderId, error);
        }
    }, [borders]);

    const value = useMemo(
        () => ({
            ready,
            borders,
            setBorderPosition,
            refresh,
        }),
        [ready, borders, setBorderPosition, refresh]
    );

    return (
        <LayoutPersistenceContext.Provider value={value}>
            {ready ? children : <div className="w-full h-full bg-graph-background" />}
        </LayoutPersistenceContext.Provider>
    );
};
