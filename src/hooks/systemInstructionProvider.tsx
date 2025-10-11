import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { SystemInstruction, SystemInstructionsContext, SystemInstructionsContextValue } from './systemInstructionProviderContext';

type DbInstruction = Database['public']['Tables']['system_instructions']['Row'];

const DEFAULT_TITLE = 'Untitled Instruction';
const USAGE_STORAGE_KEY = 'system_instruction_usage_v1';
const ROLLING_WINDOW_MS = 72 * 60 * 60 * 1000;
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

type InstructionUsageEntry = {
    instructionId: string;
    timestamp: number;
};

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
        console.warn('[SystemInstructions] Failed to read usage history', error);
        return [];
    }
};

const writeUsageHistory = (history: InstructionUsageEntry[]) => {
    if (!isBrowser) return;
    try {
        window.localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.warn('[SystemInstructions] Failed to write usage history', error);
    }
};

const pruneUsageHistory = (history: InstructionUsageEntry[]): InstructionUsageEntry[] => {
    const cutoff = Date.now() - ROLLING_WINDOW_MS;
    return history.filter((entry) => entry.timestamp >= cutoff);
};

const generateId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `instruction-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const mapRowToInstruction = (row: DbInstruction): SystemInstruction => ({
    id: row.id,
    title: row.title?.trim() || DEFAULT_TITLE,
    content: row.content ?? '',
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    isActive: Boolean(row.is_active),
});

const getTimestamp = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const sortInstructions = (list: SystemInstruction[]) =>
    [...list].sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt));

export const SystemInstructionsProvider = ({ children }: { children: ReactNode }) => {
    const [instructions, setInstructions] = useState<SystemInstruction[]>([]);
    const [activeInstructionId, setActiveInstructionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [usageHistory, setUsageHistory] = useState<InstructionUsageEntry[]>(() =>
        pruneUsageHistory(readUsageHistory()),
    );

    useEffect(() => {
        writeUsageHistory(usageHistory);
    }, [usageHistory]);

    const recordInstructionUsage = useCallback((instructionId: string) => {
        if (!instructionId) return;
        setUsageHistory((previous) =>
            pruneUsageHistory([
                ...previous,
                {
                    instructionId,
                    timestamp: Date.now(),
                },
            ]),
        );
    }, []);

    const usageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const preset of instructions) {
            counts[preset.id] = Math.max(counts[preset.id] ?? 0, 1);
        }
        for (const entry of usageHistory) {
            if (!counts[entry.instructionId]) {
                counts[entry.instructionId] = 1;
            }
            counts[entry.instructionId] += 1;
        }
        return counts;
    }, [instructions, usageHistory]);

    const getUsageScore = useCallback((instructionId: string) => usageCounts[instructionId] ?? 0, [usageCounts]);

    const syncActiveId = useCallback((list: SystemInstruction[], fallback?: string | null) => {
        const active = list.find((instruction) => instruction.isActive);
        if (active) {
            setActiveInstructionId(active.id);
            return;
        }
        if (fallback && list.some((instruction) => instruction.id === fallback)) {
            setActiveInstructionId(fallback);
            return;
        }
        setActiveInstructionId(list[0]?.id ?? null);
    }, []);

    const fetchInstructions = useCallback(async (options?: { silent?: boolean }) => {
        if (!options?.silent) {
            setLoading(true);
        }
        try {
            const { data, error } = await (supabase as any)
                .from('system_instructions')
                .select('id, title, content, updated_at, created_at, is_active')
                .order('updated_at', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped = sortInstructions((data ?? []).map(mapRowToInstruction));
            setInstructions(mapped);
            syncActiveId(mapped, activeInstructionId);
        } catch (error) {
            console.error('[SystemInstructions] Failed to fetch instructions from Supabase', error);
            setInstructions([]);
            setActiveInstructionId(null);
        } finally {
            setLoading(false);
        }
    }, [activeInstructionId, syncActiveId]);

    useEffect(() => {
        fetchInstructions().catch((error) => {
            console.error('[SystemInstructions] Initial instruction fetch failed', error);
        });
    }, [fetchInstructions]);

    useEffect(() => {
        const channel = (supabase as any)
            .channel('system_instructions_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_instructions' }, (payload: any) => {
                const eventType = payload?.eventType || payload?.event;
                if (eventType === 'DELETE' && payload?.old?.id) {
                    const removedId = String(payload.old.id);
                    setInstructions((previous) => {
                        const next = previous.filter((item) => item.id !== removedId);
                        syncActiveId(next, activeInstructionId === removedId ? null : activeInstructionId);
                        return next;
                    });
                    return;
                }

                if ((eventType === 'INSERT' || eventType === 'UPDATE') && payload?.new) {
                    const newRow = mapRowToInstruction(payload.new as DbInstruction);
                    setInstructions((previous) => {
                        const filtered = previous.filter((item) => item.id !== newRow.id);
                        const next = sortInstructions([newRow, ...filtered]);
                        syncActiveId(next, activeInstructionId);
                        return next;
                    });
                }
            })
            .subscribe();

        return () => {
            try {
                (supabase as any).removeChannel(channel);
            } catch (error) {
                console.error('[SystemInstructions] Failed to remove realtime channel', error);
            }
        };
    }, [activeInstructionId, syncActiveId]);

    const setActiveInstruction = useCallback<SystemInstructionsContextValue['setActiveInstruction']>(
        async (id) => {
            if (!id) return;
            setSaving(true);
            try {
                const { error: clearError } = await (supabase as any)
                    .from('system_instructions')
                    .update({ is_active: false })
                    .neq('id', id);
                if (clearError) throw clearError;

                const { data, error } = await (supabase as any)
                    .from('system_instructions')
                    .update({ is_active: true })
                    .eq('id', id)
                    .select('id, title, content, updated_at, created_at, is_active')
                    .maybeSingle();
                if (error) throw error;

                if (data) {
                    const mapped = mapRowToInstruction(data as DbInstruction);
                    setInstructions((previous) => {
                        const filtered = previous.filter((item) => item.id !== mapped.id);
                        const next = sortInstructions([mapped, ...filtered]);
                        syncActiveId(next, mapped.id);
                        return next;
                    });
                } else {
                    setActiveInstructionId(id);
                }

                recordInstructionUsage(id);
            } catch (error) {
                console.error('[SystemInstructions] Failed to activate instruction', error);
                throw error;
            } finally {
                setSaving(false);
            }
        },
        [recordInstructionUsage, syncActiveId],
    );

    const createInstruction = useCallback<SystemInstructionsContextValue['createInstruction']>(
        async (title, content, options) => {
            const id = generateId();
            const normalizedTitle = title.trim() || DEFAULT_TITLE;
            setSaving(true);
            try {
                const { data, error } = await (supabase as any)
                    .from('system_instructions')
                    .insert({
                        id,
                        title: normalizedTitle,
                        content,
                        is_active: options?.activate ?? false,
                    })
                    .select('id, title, content, updated_at, created_at, is_active')
                    .maybeSingle();
                if (error) throw error;

                if (data) {
                    const mapped = mapRowToInstruction(data as DbInstruction);
                    setInstructions((previous) => {
                        const filtered = previous.filter((item) => item.id !== mapped.id);
                        const next = sortInstructions([mapped, ...filtered]);
                        syncActiveId(next, mapped.isActive ? mapped.id : activeInstructionId);
                        return next;
                    });
                }

                if (options?.activate) {
                    await setActiveInstruction(id);
                }

                if (options?.activate) {
                    recordInstructionUsage(id);
                }

                return id;
            } catch (error) {
                console.error('[SystemInstructions] Failed to create instruction', error);
                throw error;
            } finally {
                setSaving(false);
            }
        },
        [activeInstructionId, recordInstructionUsage, setActiveInstruction, syncActiveId],
    );

    const updateInstruction = useCallback<SystemInstructionsContextValue['updateInstruction']>(
        async (id, title, content, options) => {
            const normalizedTitle = title.trim() || DEFAULT_TITLE;
            setSaving(true);
            try {
                const { data, error } = await (supabase as any)
                    .from('system_instructions')
                    .update({ title: normalizedTitle, content })
                    .eq('id', id)
                    .select('id, title, content, updated_at, created_at, is_active')
                    .maybeSingle();
                if (error) throw error;

                if (data) {
                    const mapped = mapRowToInstruction(data as DbInstruction);
                    setInstructions((previous) => {
                        const filtered = previous.filter((item) => item.id !== mapped.id);
                        const next = sortInstructions([mapped, ...filtered]);
                        syncActiveId(next, mapped.isActive ? mapped.id : activeInstructionId);
                        return next;
                    });
                }

                if (options?.activate) {
                    await setActiveInstruction(id);
                }

                if (options?.activate) {
                    recordInstructionUsage(id);
                }
            } catch (error) {
                console.error('[SystemInstructions] Failed to update instruction', error);
                throw error;
            } finally {
                setSaving(false);
            }
        },
        [activeInstructionId, recordInstructionUsage, setActiveInstruction, syncActiveId],
    );

    const deleteInstruction = useCallback<SystemInstructionsContextValue['deleteInstruction']>(
        async (id) => {
            if (!id) return;
            setSaving(true);
            try {
                const { error } = await (supabase as any)
                    .from('system_instructions')
                    .delete()
                    .eq('id', id);
                if (error) throw error;

                setInstructions((previous) => {
                    const next = previous.filter((instruction) => instruction.id !== id);
                    syncActiveId(next, activeInstructionId === id ? null : activeInstructionId);
                    return next;
                });
            } catch (error) {
                console.error('[SystemInstructions] Failed to delete instruction', error);
                throw error;
            } finally {
                setSaving(false);
            }
        },
        [activeInstructionId, syncActiveId],
    );

    const overwriteActiveInstruction = useCallback<SystemInstructionsContextValue['overwriteActiveInstruction']>(
        async (content) => {
            if (!activeInstructionId) return;
            const current = instructions.find((instruction) => instruction.id === activeInstructionId);
            if (!current) return;
            await updateInstruction(activeInstructionId, current.title, content, { activate: true });
        },
        [activeInstructionId, instructions, updateInstruction],
    );

    const refreshActiveFromSupabase = useCallback(async () => {
        await fetchInstructions();
    }, [fetchInstructions]);

    const activeInstruction = useMemo(() => (
        activeInstructionId
            ? instructions.find((preset) => preset.id === activeInstructionId) ?? null
            : null
    ), [activeInstructionId, instructions]);

    const contextValue = useMemo<SystemInstructionsContextValue>(() => ({
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
        recordInstructionUsage,
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
