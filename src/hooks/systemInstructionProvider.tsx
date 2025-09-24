import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SystemInstruction, SystemInstructionsContext, SystemInstructionsContextValue } from './systemInstructionProviderContext';

const LOCAL_STORAGE_KEY = 'system_instruction_presets_v1';

interface StoredPreset {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
}

const DEFAULT_TITLE = 'Current Instruction';

const readLocalPresets = (): StoredPreset[] => {
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((preset) => preset.id && preset.content);
    } catch (error) {
        console.warn('[SystemInstructions] Failed to parse presets from local storage', error);
        return [];
    }
};

const writeLocalPresets = (presets: StoredPreset[]) => {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(presets));
    } catch (error) {
        console.warn('[SystemInstructions] Failed to store presets in local storage', error);
    }
};

export const SystemInstructionsProvider = ({ children }: { children: ReactNode }) => {
    const [presets, setPresets] = useState<StoredPreset[]>(() => readLocalPresets());
    const [activeInstructionId, setActiveInstructionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        writeLocalPresets(presets);
    }, [presets]);

    const refreshActiveFromSupabase = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await (supabase as any)
                .from('system_instructions')
                .select('id, content, updated_at')
                .eq('id', 'main')
                .maybeSingle();

            if (error) throw error;

            if (data) {
                const existing = presets.find((preset) => preset.id === data.id);
                const instruction: StoredPreset = {
                    id: data.id,
                    title: existing?.title ?? DEFAULT_TITLE,
                    content: data.content ?? '',
                    updatedAt: data.updated_at ?? new Date().toISOString(),
                };

                if (!existing || existing.content !== instruction.content) {
                    setPresets((prev) => {
                        const others = prev.filter((preset) => preset.id !== instruction.id);
                        return [instruction, ...others];
                    });
                }
                setActiveInstructionId(instruction.id);
            }
        } catch (error) {
            console.error('[SystemInstructions] Failed to refresh from Supabase', error);
        } finally {
            setLoading(false);
        }
    }, [presets]);

    useEffect(() => {
        refreshActiveFromSupabase();
    }, [refreshActiveFromSupabase]);

    const persistToSupabase = useCallback(async (content: string) => {
        setSaving(true);
        try {
            const { error } = await (supabase as any)
                .from('system_instructions')
                .update({ content })
                .eq('id', 'main');
            if (error) throw error;
        } catch (error) {
            console.error('[SystemInstructions] Failed to persist to Supabase', error);
            throw error;
        } finally {
            setSaving(false);
        }
    }, []);

    const createInstruction = useCallback<
        SystemInstructionsContextValue['createInstruction']
    >(async (title, content, options) => {
        const id = crypto.randomUUID();
        const newPreset: StoredPreset = {
            id,
            title: title.trim() || `Preset ${presets.length + 1}`,
            content,
            updatedAt: new Date().toISOString(),
        };

        setPresets((prev) => [newPreset, ...prev]);

        if (options?.activate) {
            setActiveInstructionId(id);
            await persistToSupabase(content);
        }

        return id;
    }, [persistToSupabase, presets.length]);

    const updateInstruction = useCallback<
        SystemInstructionsContextValue['updateInstruction']
    >(async (id, title, content, options) => {
        setPresets((prev) => prev.map((preset) => (
            preset.id === id
                ? { ...preset, title: title.trim() || preset.title, content, updatedAt: new Date().toISOString() }
                : preset
        )));

        const shouldActivate = options?.activate || activeInstructionId === id;
        if (shouldActivate) {
            setActiveInstructionId(id);
            await persistToSupabase(content);
        }
    }, [activeInstructionId, persistToSupabase]);

    const deleteInstruction = useCallback<SystemInstructionsContextValue['deleteInstruction']>(async (id) => {
        setPresets((prev) => prev.filter((preset) => preset.id !== id));
        if (activeInstructionId === id) {
            await refreshActiveFromSupabase();
        }
    }, [activeInstructionId, refreshActiveFromSupabase]);

    const setActiveInstruction = useCallback<SystemInstructionsContextValue['setActiveInstruction']>(async (id) => {
        const preset = presets.find((item) => item.id === id);
        if (!preset) return;
        setActiveInstructionId(id);
        await persistToSupabase(preset.content);
    }, [presets, persistToSupabase]);

    const overwriteActiveInstruction = useCallback<SystemInstructionsContextValue['overwriteActiveInstruction']>(async (content) => {
        if (!activeInstructionId) return;
        setPresets((prev) => prev.map((preset) => (
            preset.id === activeInstructionId
                ? { ...preset, content, updatedAt: new Date().toISOString() }
                : preset
        )));
        await persistToSupabase(content);
    }, [activeInstructionId, persistToSupabase]);

    const contextValue = useMemo<SystemInstructionsContextValue>(() => {
        const activeInstruction = activeInstructionId
            ? presets.find((preset) => preset.id === activeInstructionId) ?? null
            : null;

        const instructions: SystemInstruction[] = presets.map((preset) => ({
            id: preset.id,
            title: preset.title,
            content: preset.content,
            updatedAt: preset.updatedAt,
        }));

        return {
            instructions,
            activeInstructionId,
            activeInstruction,
            loading,
            saving,
            createInstruction,
            updateInstruction,
            deleteInstruction,
            setActiveInstruction,
            overwriteActiveInstruction,
            refreshActiveFromSupabase,
        };
    }, [activeInstruction, activeInstructionId, createInstruction, deleteInstruction, loading, overwriteActiveInstruction, presets, refreshActiveFromSupabase, saving, setActiveInstruction, updateInstruction]);

    return (
        <SystemInstructionsContext.Provider value={contextValue}>
            {children}
        </SystemInstructionsContext.Provider>
    );
};

