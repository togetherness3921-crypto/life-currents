import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { SystemInstruction, SystemInstructionsContext, SystemInstructionsContextValue } from './systemInstructionProviderContext';

type InstructionRow = Database['public']['Tables']['system_instruction_presets']['Row'];

type FetchOptions = {
  showLoading?: boolean;
};

const mapRowToInstruction = (row: InstructionRow): SystemInstruction => ({
  id: row.id,
  title: row.title ?? 'Untitled instruction',
  content: row.content ?? '',
  updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
});

const normalizeTitle = (title: string) => title.trim() || 'Untitled instruction';

export const SystemInstructionsProvider = ({ children }: { children: ReactNode }) => {
  const [instructions, setInstructions] = useState<SystemInstruction[]>([]);
  const [activeInstructionId, setActiveInstructionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const ensureDefaultInstruction = useCallback(async (): Promise<InstructionRow | null> => {
    try {
      const { data: activeContentRow, error: activeError } = await (supabase as any)
        .from('system_instructions')
        .select('content')
        .eq('id', 'main')
        .maybeSingle();

      if (activeError) {
        console.error('[SystemInstructions] Failed to read primary instruction content', activeError);
      }

      const defaultContent = activeContentRow?.content ?? '';
      const { data, error } = await (supabase as any)
        .from('system_instruction_presets')
        .insert({
          title: 'Primary Instruction',
          content: defaultContent,
          is_active: true,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as InstructionRow;
    } catch (error) {
      console.error('[SystemInstructions] Failed to ensure default instruction preset', error);
      return null;
    }
  }, []);

  const persistActiveInstructionContent = useCallback(async (content: string) => {
    const { error } = await (supabase as any)
      .from('system_instructions')
      .update({ content })
      .eq('id', 'main');

    if (error) {
      throw error;
    }
  }, []);

  const fetchInstructions = useCallback(async ({ showLoading = true }: FetchOptions = {}) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const { data, error } = await (supabase as any)
        .from('system_instruction_presets')
        .select('*')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      let rows = (data as InstructionRow[]) ?? [];
      if (rows.length === 0) {
        const fallback = await ensureDefaultInstruction();
        rows = fallback ? [fallback] : [];
      }

      const normalized = rows.map(mapRowToInstruction);
      normalized.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setInstructions(normalized);

      const activeRow = rows.find((row) => row.is_active) ?? rows[0] ?? null;
      setActiveInstructionId(activeRow ? activeRow.id : null);
    } catch (error) {
      console.error('[SystemInstructions] Failed to load instruction presets', error);
      setInstructions([]);
      setActiveInstructionId(null);
    } finally {
      setLoading(false);
    }
  }, [ensureDefaultInstruction]);

  useEffect(() => {
    fetchInstructions().catch((error) => {
      console.error('[SystemInstructions] Initial fetch failed', error);
    });
  }, [fetchInstructions]);

  useEffect(() => {
    const channel = (supabase as any)
      .channel('system_instruction_presets_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_instruction_presets' }, () => {
        fetchInstructions({ showLoading: false }).catch((error) => {
          console.error('[SystemInstructions] Realtime refresh failed', error);
        });
      })
      .subscribe();

    return () => {
      try {
        (supabase as any).removeChannel(channel);
      } catch (error) {
        console.error('[SystemInstructions] Failed to remove realtime channel', error);
      }
    };
  }, [fetchInstructions]);

  const applyActivation = useCallback(
    async (id: string, content: string) => {
      await (supabase as any)
        .from('system_instruction_presets')
        .update({ is_active: false })
        .neq('id', id);

      await (supabase as any)
        .from('system_instruction_presets')
        .update({ is_active: true })
        .eq('id', id);

      await persistActiveInstructionContent(content);
      setActiveInstructionId(id);
    },
    [persistActiveInstructionContent],
  );

  const createInstruction: SystemInstructionsContextValue['createInstruction'] = useCallback(
    async (title, content, options) => {
      setSaving(true);
      try {
        const normalizedTitle = normalizeTitle(title);
        const { data, error } = await (supabase as any)
          .from('system_instruction_presets')
          .insert({
            title: normalizedTitle,
            content,
            is_active: options?.activate ?? false,
          })
          .select('*')
          .single();

        if (error) throw error;
        const inserted = data as InstructionRow;

        if (options?.activate) {
          await applyActivation(inserted.id, content);
        }

        await fetchInstructions({ showLoading: false });
        return inserted.id;
      } catch (error) {
        console.error('[SystemInstructions] Failed to create preset', error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [applyActivation, fetchInstructions],
  );

  const updateInstruction: SystemInstructionsContextValue['updateInstruction'] = useCallback(
    async (id, title, content, options) => {
      setSaving(true);
      try {
        const normalizedTitle = normalizeTitle(title);
        const payload: Database['public']['Tables']['system_instruction_presets']['Update'] = {
          title: normalizedTitle,
          content,
          updated_at: new Date().toISOString(),
        };

        if (options?.activate) {
          payload.is_active = true;
        }

        const { error } = await (supabase as any)
          .from('system_instruction_presets')
          .update(payload)
          .eq('id', id);

        if (error) throw error;

        if (options?.activate || activeInstructionId === id) {
          await applyActivation(id, content);
        }

        await fetchInstructions({ showLoading: false });
      } catch (error) {
        console.error('[SystemInstructions] Failed to update preset', error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [activeInstructionId, applyActivation, fetchInstructions],
  );

  const deleteInstruction: SystemInstructionsContextValue['deleteInstruction'] = useCallback(
    async (id) => {
      setSaving(true);
      try {
        const { error } = await (supabase as any)
          .from('system_instruction_presets')
          .delete()
          .eq('id', id);

        if (error) throw error;

        await fetchInstructions({ showLoading: false });
      } catch (error) {
        console.error('[SystemInstructions] Failed to delete preset', error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [fetchInstructions],
  );

  const setActiveInstruction = useCallback<SystemInstructionsContextValue['setActiveInstruction']>(
    async (id) => {
      const instruction = instructions.find((item) => item.id === id);
      if (!instruction) {
        throw new Error('Instruction not found');
      }

      setSaving(true);
      try {
        await applyActivation(id, instruction.content);
        await fetchInstructions({ showLoading: false });
      } catch (error) {
        console.error('[SystemInstructions] Failed to activate preset', error);
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [applyActivation, fetchInstructions, instructions],
  );

  const overwriteActiveInstruction = useCallback<SystemInstructionsContextValue['overwriteActiveInstruction']>(
    async (content) => {
      if (!activeInstructionId) return;
      const current = instructions.find((item) => item.id === activeInstructionId);
      if (!current) return;
      await updateInstruction(activeInstructionId, current.title, content, { activate: true });
    },
    [activeInstructionId, instructions, updateInstruction],
  );

  const refreshActiveFromSupabase = useCallback(async () => {
    await fetchInstructions();
  }, [fetchInstructions]);

  const getUsageScore = useCallback<SystemInstructionsContextValue['getUsageScore']>(() => 0, []);
  const recordInstructionUsage = useCallback<SystemInstructionsContextValue['recordInstructionUsage']>(() => {}, []);

  const activeInstruction = useMemo(
    () => (activeInstructionId ? instructions.find((item) => item.id === activeInstructionId) ?? null : null),
    [activeInstructionId, instructions],
  );

  const contextValue = useMemo<SystemInstructionsContextValue>(() => ({
    instructions,
    activeInstructionId,
    activeInstruction,
    loading,
    saving,
    getUsageScore,
    recordInstructionUsage,
    createInstruction,
    updateInstruction,
    deleteInstruction,
    setActiveInstruction,
    overwriteActiveInstruction,
    refreshActiveFromSupabase,
  }), [
    activeInstruction,
    activeInstructionId,
    createInstruction,
    deleteInstruction,
    getUsageScore,
    instructions,
    loading,
    overwriteActiveInstruction,
    recordInstructionUsage,
    refreshActiveFromSupabase,
    saving,
    setActiveInstruction,
    updateInstruction,
  ]);

  return (
    <SystemInstructionsContext.Provider value={contextValue}>
      {children}
    </SystemInstructionsContext.Provider>
  );
};
