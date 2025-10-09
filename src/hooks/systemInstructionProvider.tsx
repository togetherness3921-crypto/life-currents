import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SystemInstruction, SystemInstructionsContext, SystemInstructionsContextValue } from './systemInstructionProviderContext';

const LOCAL_STORAGE_KEY = 'system_instruction_presets_v1';
const USAGE_STORAGE_KEY = 'system_instruction_usage_history_v1';
const USAGE_WINDOW_MS = 72 * 60 * 60 * 1000;
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

interface StoredPreset {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
}

const DEFAULT_TITLE = 'Current Instruction';

const readLocalPresets = (): StoredPreset[] => {
    if (!isBrowser) return [];
    try {
        const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((preset) => preset.id && typeof preset.content === 'string');
    } catch (error) {
        console.warn('[SystemInstructions] Failed to parse presets from local storage', error);
        return [];
    }
};

const writeLocalPresets = (presets: StoredPreset[]) => {
    if (!isBrowser) return;
    try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(presets));
    } catch (error) {
        console.warn('[SystemInstructions] Failed to store presets in local storage', error);
    }
};

interface InstructionUsageEntry {
    instructionId: string;
    timestamp: number;
}

const readUsageHistory = (): InstructionUsageEntry[] => {
    if (!isBrowser) return [];
    try {
        const raw = window.localStorage.getItem(USAGE_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (entry) => typeof entry?.instructionId === 'string' && typeof entry?.timestamp === 'number',
        );
    } catch (error) {
        console.warn('[SystemInstructions] Failed to read instruction usage history', error);
        return [];
    }
};

const writeUsageHistory = (history: InstructionUsageEntry[]) => {
    if (!isBrowser) return;
    try {
        window.localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.warn('[SystemInstructions] Failed to write instruction usage history', error);
    }
};

const pruneUsageHistory = (history: InstructionUsageEntry[]): InstructionUsageEntry[] => {
    const cutoff = Date.now() - USAGE_WINDOW_MS;
    return history.filter((entry) => entry.timestamp >= cutoff);
};

const generateId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `instruction-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const SystemInstructionsProvider = ({ children }: { children: ReactNode }) => {
    const [presets, setPresets] = useState<StoredPreset[]>(() => readLocalPresets());
    const [activeInstructionId, setActiveInstructionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [usageHistory, setUsageHistory] = useState<InstructionUsageEntry[]>(() => pruneUsageHistory(readUsageHistory()));

    useEffect(() => {
        writeLocalPresets(presets);
    }, [presets]);

    useEffect(() => {
        writeUsageHistory(usageHistory);
    }, [usageHistory]);

    const recordUsage = useCallback((instructionId: string) => {
        setUsageHistory((previous) =>
            pruneUsageHistory([...previous, { instructionId, timestamp: Date.now() }]),
        );
    }, []);

    const usageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const preset of presets) {
            if (!counts[preset.id]) {
                counts[preset.id] = 0;
            }
        }
        for (const entry of usageHistory) {
            counts[entry.instructionId] = (counts[entry.instructionId] ?? 0) + 1;
        }
        return counts;
    }, [presets, usageHistory]);

    const getUsageScore = useCallback((instructionId: string) => usageCounts[instructionId] ?? 0, [usageCounts]);

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
                setPresets((prev) => {
                    const existing = prev.find((preset) => preset.id === data.id);
                    const instruction: StoredPreset = {
                        id: data.id,
                        title: existing?.title ?? DEFAULT_TITLE,
                        content: data.content ?? '',
                        updatedAt: data.updated_at ?? new Date().toISOString(),
                    };

                    const others = prev.filter((preset) => preset.id !== instruction.id);
                    return [instruction, ...others];
                });
                setActiveInstructionId(data.id);
                recordUsage(data.id);
            } else {
                setActiveInstructionId(null);
            }
        } catch (error) {
            console.error('[SystemInstructions] Failed to refresh from Supabase', error);
        } finally {
            setLoading(false);
        }
    }, [recordUsage]);

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
        const id = generateId();
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
            recordUsage(id);
        }

        return id;
    }, [persistToSupabase, presets.length, recordUsage]);

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
            recordUsage(id);
        }
    }, [activeInstructionId, persistToSupabase, recordUsage]);

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
        recordUsage(id);
    }, [persistToSupabase, presets, recordUsage]);

    const overwriteActiveInstruction = useCallback<SystemInstructionsContextValue['overwriteActiveInstruction']>(async (content) => {
        if (!activeInstructionId) return;
        setPresets((prev) => prev.map((preset) => (
            preset.id === activeInstructionId
                ? { ...preset, content, updatedAt: new Date().toISOString() }
                : preset
        )));
        await persistToSupabase(content);
    }, [activeInstructionId, persistToSupabase]);

    const activeInstruction = useMemo(() => (
        activeInstructionId
            ? presets.find((preset) => preset.id === activeInstructionId) ?? null
            : null
    ), [activeInstructionId, presets]);

    const contextValue = useMemo<SystemInstructionsContextValue>(() => {
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
            getUsageScore,
        };
    }, [activeInstruction, activeInstructionId, createInstruction, deleteInstruction, getUsageScore, loading, overwriteActiveInstruction, presets, refreshActiveFromSupabase, saving, setActiveInstruction, updateInstruction]);

    return (
        <SystemInstructionsContext.Provider value={contextValue}>
            {children}
        </SystemInstructionsContext.Provider>
    );
};
