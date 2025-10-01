import { supabase } from '@/integrations/supabase/client';
import { submitSupabaseOperation } from './supabaseQueue';

type LayoutAxis = 'x' | 'y';

export interface LayoutBorderRow {
  border_id: string;
  axis: LayoutAxis;
  position: number;
  updated_at: string | null;
}

export const fetchLayoutBorders = async (): Promise<Record<string, LayoutBorderRow>> => {
  try {
    const { data, error } = await supabase.from('layout_borders').select('*');
    if (error) throw error;
    const map: Record<string, LayoutBorderRow> = {};
    (data ?? []).forEach((row) => {
      map[row.border_id] = row as LayoutBorderRow;
    });
    return map;
  } catch (error) {
    console.warn('[LayoutPersistence] Failed to load layout borders', error);
    return {};
  }
};

export const persistLayoutBorder = async (borderId: string, axis: LayoutAxis, position: number) => {
  await submitSupabaseOperation('layout.upsert_border', {
    border_id: borderId,
    axis,
    position,
    updated_at: new Date().toISOString(),
  });
};

export const persistLayoutBorders = async (
  borders: Array<{ borderId: string; axis: LayoutAxis; position: number }>
) => {
  await Promise.all(
    borders.map((border) =>
      submitSupabaseOperation('layout.upsert_border', {
        border_id: border.borderId,
        axis: border.axis,
        position: border.position,
        updated_at: new Date().toISOString(),
      })
    )
  );
};

