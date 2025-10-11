import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { SystemInstruction, SystemInstructionsContext, SystemInstructionsContextValue } from './systemInstructionProviderContext';

type SystemInstructionRow = Database['public']['Tables']['system_instructions']['Row'];
type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

const generateId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `instruction-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const mapRowToInstruction = (row: SystemInstructionRow): SystemInstruction => ({
    id: row.id,
    title: row.title ?? 'Untitled Instruction',
    content: row.content ?? '',
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    isActive: Boolean(row.is_active),
});

const sortInstructions = (list: SystemInstruction[]) =>
    [...list].sort((a, b) => {
        if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1;
        }
        const delta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (!Number.isNaN(delta) && delta !== 0) {
            return delta;
        }
        return a.title.localeCompare(b.title);
    });

export const SystemInstructionsProvider = ({ children }: { children: ReactNode }) => {
    const [instructions, setInstructions] = useState<SystemInstruction[]>([]);
    const [activeInstructionId, setActiveInstructionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshActiveFromSupabase = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await (supabase as any)
                .from('system_instructions')
                .select('id, title, content, is_active, updated_at, created_at')
                .order('updated_at', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped = sortInstructions((data ?? []).map(mapRowToInstruction));
            setInstructions(mapped);
            setActiveInstructionId((current) => {
                const activeFromData = mapped.find((inst) => inst.isActive)?.id ?? null;
                if (activeFromData) {
                    return activeFromData;
                }
                if (current && mapped.some((inst) => inst.id === current)) {
                    return current;
                }
                return mapped[0]?.id ?? null;
            });
        } catch (error) {
            console.error('[SystemInstructions] Failed to refresh instructions from Supabase', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshActiveFromSupabase();
    }, [refreshActiveFromSupabase]);

    useEffect(() => {
        const channel = (supabase as any)
            .channel('system_instructions_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_instructions' }, (payload: any) => {
                const eventType = (payload?.eventType || payload?.event) as RealtimeEvent | undefined;
                if (!eventType) {
                    return;
                }

                if (eventType === 'DELETE' && payload?.old) {
                    const removedId = (payload.old as SystemInstructionRow).id;
                    setInstructions((prev) => {
                        const next = sortInstructions(prev.filter((inst) => inst.id !== removedId));
                        setActiveInstructionId((current) => {
                            if (current === removedId) {
                                return next.find((inst) => inst.isActive)?.id ?? next[0]?.id ?? null;
                            }
                            if (current && next.some((inst) => inst.id === current)) {
                                return current;
                            }
                            return next.find((inst) => inst.isActive)?.id ?? next[0]?.id ?? null;
                        });
                        return next;
                    });
                    return;
                }

                if ((eventType === 'INSERT' || eventType === 'UPDATE') && payload?.new) {
                    const updated = mapRowToInstruction(payload.new as SystemInstructionRow);
                    setInstructions((prev) => {
                        const withoutTarget = prev.filter((inst) => inst.id !== updated.id);
                        const normalized = updated.isActive
                            ? withoutTarget.map((inst) => ({ ...inst, isActive: false }))
                            : withoutTarget;
                        const next = sortInstructions([updated, ...normalized]);
                        setActiveInstructionId((current) => {
                            if (updated.isActive) {
                                return updated.id;
                            }
                            if (current && next.some((inst) => inst.id === current)) {
                                if (current === updated.id && !updated.isActive) {
                                    return next.find((inst) => inst.isActive)?.id ?? next[0]?.id ?? null;
                                }
                                return current;
                            }
                            return next.find((inst) => inst.isActive)?.id ?? next[0]?.id ?? null;
                        });
                        return next;
                    });
                }
            })
            .subscribe();

        return () => {
            try {
                (supabase as any).removeChannel(channel);
            } catch (error) {
                console.error('[SystemInstructions] Failed to remove Supabase channel', error);
            }
        };
    }, []);

    const createInstruction = useCallback<SystemInstructionsContextValue['createInstruction']>(
        async (title, content, options) => {
            const id = generateId();
            const normalizedTitle = title.trim() || 'Untitled Instruction';
            const isActive = Boolean(options?.activate);
            try {
                const { error } = await (supabase as any)
                    .from('system_instructions')
                    .insert({
                        id,
                        title: normalizedTitle,
                        content,
                        is_active: isActive,
                    });

                if (error) throw error;

                setInstructions((prev) => {
                    const normalizedPrev = isActive ? prev.map((inst) => ({ ...inst, isActive: false })) : prev;
                    const next = sortInstructions([
                        {
                            id,
                            title: normalizedTitle,
                            content,
                            updatedAt: new Date().toISOString(),
                            isActive,
                        },
                        ...normalizedPrev.filter((inst) => inst.id !== id),
                    ]);
                    return next;
                });

                if (isActive) {
                    setActiveInstructionId(id);
                    const { error: deactivateError } = await (supabase as any)
                        .from('system_instructions')
                        .update({ is_active: false })
                        .neq('id', id);
                    if (deactivateError) {
                        throw deactivateError;
                    }
                }

                return id;
            } catch (error) {
                console.error('[SystemInstructions] Failed to create instruction', error);
                throw error;
            }
        },
        [],
    );

    const updateInstruction = useCallback<SystemInstructionsContextValue['updateInstruction']>(
        async (id, title, content) => {
            const normalizedTitle = title.trim() || 'Untitled Instruction';
            const timestamp = new Date().toISOString();
            try {
                const { error } = await (supabase as any)
                    .from('system_instructions')
                    .update({ title: normalizedTitle, content, updated_at: timestamp })
                    .eq('id', id);

                if (error) throw error;

                setInstructions((prev) =>
                    sortInstructions(
                        prev.map((inst) =>
                            inst.id === id ? { ...inst, title: normalizedTitle, content, updatedAt: timestamp } : inst,
                        ),
                    ),
                );
            } catch (error) {
                console.error('[SystemInstructions] Failed to update instruction', error);
                throw error;
            }
        },
        [],
    );

    const deleteInstruction = useCallback<SystemInstructionsContextValue['deleteInstruction']>(
        async (id) => {
            try {
                const { error } = await (supabase as any).from('system_instructions').delete().eq('id', id);
                if (error) throw error;

                setInstructions((prev) => {
                    const next = sortInstructions(prev.filter((inst) => inst.id !== id));
                    setActiveInstructionId((current) => {
                        if (current === id) {
                            return next.find((inst) => inst.isActive)?.id ?? next[0]?.id ?? null;
                        }
                        if (current && next.some((inst) => inst.id === current)) {
                            return current;
                        }
                        return next.find((inst) => inst.isActive)?.id ?? next[0]?.id ?? null;
                    });
                    return next;
                });
            } catch (error) {
                console.error('[SystemInstructions] Failed to delete instruction', error);
                throw error;
            }
        },
        [],
    );

    const setActiveInstruction = useCallback<SystemInstructionsContextValue['setActiveInstruction']>(
        async (id) => {
            try {
                const { error: deactivateError } = await (supabase as any)
                    .from('system_instructions')
                    .update({ is_active: false })
                    .neq('id', id);
                if (deactivateError) throw deactivateError;

                const { error } = await (supabase as any)
                    .from('system_instructions')
                    .update({ is_active: true })
                    .eq('id', id);
                if (error) throw error;

                setInstructions((prev) =>
                    sortInstructions(
                        prev.map((inst) => ({
                            ...inst,
                            isActive: inst.id === id,
                        })),
                    ),
                );
                setActiveInstructionId(id);
            } catch (error) {
                console.error('[SystemInstructions] Failed to set active instruction', error);
                throw error;
            }
        },
        [],
    );

    const overwriteActiveInstruction = useCallback<SystemInstructionsContextValue['overwriteActiveInstruction']>(
        async (content) => {
            if (!activeInstructionId) return;
            const timestamp = new Date().toISOString();
            try {
                const { error } = await (supabase as any)
                    .from('system_instructions')
                    .update({ content, updated_at: timestamp })
                    .eq('id', activeInstructionId);

                if (error) throw error;

                setInstructions((prev) =>
                    sortInstructions(
                        prev.map((inst) =>
                            inst.id === activeInstructionId
                                ? { ...inst, content, updatedAt: timestamp }
                                : inst,
                        ),
                    ),
                );
            } catch (error) {
                console.error('[SystemInstructions] Failed to overwrite active instruction', error);
                throw error;
            }
        },
        [activeInstructionId],
    );

    const activeInstruction = useMemo(
        () => (activeInstructionId ? instructions.find((inst) => inst.id === activeInstructionId) ?? null : null),
        [instructions, activeInstructionId],
    );

    const contextValue = useMemo(
        () => ({
            instructions,
            activeInstructionId,
            activeInstruction,
            loading,
            createInstruction,
            updateInstruction,
            deleteInstruction,
            setActiveInstruction,
            overwriteActiveInstruction,
            refreshActiveFromSupabase,
        }),
        [
            instructions,
            activeInstructionId,
            activeInstruction,
            loading,
            createInstruction,
            updateInstruction,
            deleteInstruction,
            setActiveInstruction,
            overwriteActiveInstruction,
            refreshActiveFromSupabase,
        ],
    );

    return (
        <SystemInstructionsContext.Provider value={contextValue}>
            {children}
        </SystemInstructionsContext.Provider>
    );
};
