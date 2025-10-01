import { supabase } from '@/integrations/supabase/client';

export type LayoutAxis = 'x' | 'y';

export const LayoutBorderId = {
    MainVerticalTop: 'main-vertical-top-progress',
    MainVerticalBottom: 'main-vertical-progress-chat',
    MainHorizontalGraphTasks: 'main-horizontal-graph-tasks',
    MainHorizontalTasksCalendar: 'main-horizontal-tasks-calendar',
    ProgressHorizontal: 'main-progress-progress-stats',
    ChatSidebar: 'chat-sidebar-divider',
} as const;

export type LayoutBorderId = (typeof LayoutBorderId)[keyof typeof LayoutBorderId];

export interface LayoutBorderRecord {
    border_id: LayoutBorderId;
    axis: LayoutAxis;
    position: number;
}

export const loadLayoutBorders = async (): Promise<Record<string, LayoutBorderRecord>> => {
    try {
        const { data, error } = await supabase.from('layout_borders').select('border_id, axis, position');
        if (error) throw error;
        if (!data) return {};
        return data.reduce<Record<string, LayoutBorderRecord>>((acc, row) => {
            acc[row.border_id] = {
                border_id: row.border_id as LayoutBorderId,
                axis: row.axis as LayoutAxis,
                position: Number(row.position),
            };
            return acc;
        }, {});
    } catch (error) {
        console.error('[LayoutPersistence] Failed to load layout borders', error);
        return {};
    }
};

export const saveLayoutBorders = async (borders: LayoutBorderRecord[]): Promise<void> => {
    if (!borders.length) return;
    const payload = borders.map((border) => ({
        border_id: border.border_id,
        axis: border.axis,
        position: border.position,
        updated_at: new Date().toISOString(),
    }));
    try {
        const { error } = await supabase.from('layout_borders').upsert(payload);
        if (error) throw error;
    } catch (error) {
        console.error('[LayoutPersistence] Failed to save layout borders', error);
    }
};
