import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SystemInstruction, SystemInstructionsContext, SystemInstructionsContextValue } from './systemInstructionProviderContext';

type InstructionRow = {
    id: string;
    title?: string | null;
    content?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
    is_active?: boolean | null;
};

const normalizeTitle = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : 'Untitled Instruction';
};

const mapRowToInstruction = (row: InstructionRow): SystemInstruction => ({
    id: row.id,
    title: normalizeTitle(row.title ?? ''),
    content: row.content ?? '',
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    isActive: Boolean(row.is_active),
});

const sortInstructions = (items: SystemInstruction[]) =>
    [...items].sort((a, b) => {
        const dateDelta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (dateDelta !== 0 && !Number.isNaN(dateDelta)) {
            return dateDelta;
        }
        return a.title.localeCompare(b.title);
    });

export const SystemInstructionsProvider = ({ children }: { children: ReactNode }) => {
    const [instructions, setInstructions] = useState<SystemInstruction[]>([]);
    const [activeInstructionId, setActiveInstructionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const hasLoadedRef = useRef(false);

    const resolveActiveId = useCallback((list: SystemInstruction[], preferredId?: string | null) => {
        if (preferredId && list.some((item) => item.id === preferredId)) {
            return preferredId;
        }
        const activeItem = list.find((item) => item.isActive);
        if (activeItem) {
            return activeItem.id;
        }
        return list[0]?.id ?? null;
    }, []);

    const loadInstructions = useCallback(async () => {
        if (!hasLoadedRef.current) {
            setLoading(true);
        }

        try {
            const { data, error } = await (supabase as any)
                .from('system_instructions')
                .select('id, title, content, updated_at, created_at, is_active')
                .order('updated_at', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped = (data ?? []).map(mapRowToInstruction);
            const sorted = sortInstructions(mapped);
            setInstructions(sorted);
            setActiveInstructionId(resolveActiveId(sorted));
        } catch (error) {
            console.error('[SystemInstructions] Failed to load instructions', error);
        } finally {
            setLoading(false);
            hasLoadedRef.current = true;
        }
    }, [resolveActiveId]);

    useEffect(() => {
        void loadInstructions();
    }, [loadInstructions]);

    useEffect(() => {
        const channel = (supabase as any)
            .channel('system_instructions_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'system_instructions' },
                (payload: any) => {
                    if (!payload) return;
                    const eventType = (payload.eventType || payload.event) as 'INSERT' | 'UPDATE' | 'DELETE' | undefined;

                    if (eventType === 'DELETE' && payload.old?.id) {
                        const deletedId = payload.old.id as string;
                        let updatedList: SystemInstruction[] = [];
                        setInstructions((prev) => {
                            updatedList = prev.filter((item) => item.id !== deletedId);
                            return updatedList;
                        });
                        setActiveInstructionId((current) => {
                            if (current && current !== deletedId) {
                                return current;
                            }
                            return resolveActiveId(updatedList);
                        });
                        return;
                    }

                    if (payload.new) {
                        const instruction = mapRowToInstruction(payload.new as InstructionRow);
                        let updatedList: SystemInstruction[] = [];
                        setInstructions((prev) => {
                            const filtered = prev.filter((item) => item.id !== instruction.id);
                            const normalized = instruction.isActive
                                ? filtered.map((item) => ({ ...item, isActive: false }))
                                : filtered;
                            updatedList = sortInstructions([...normalized, instruction]);
                            return updatedList;
                        });
                        setActiveInstructionId((current) => {
                            if (instruction.isActive) {
                                return instruction.id;
                            }
                            if (current && updatedList.some((item) => item.id === current)) {
                                return current;
                            }
                            return resolveActiveId(updatedList);
                        });
                    }
                },
            )
            .subscribe();

        return () => {
            try {
                (supabase as any).removeChannel(channel);
            } catch (error) {
                console.error('[SystemInstructions] Failed to remove realtime channel', error);
            }
        };
    }, [resolveActiveId]);

    const getUsageScore = useCallback((_: string) => 0, []);
    const recordInstructionUsage = useCallback((_: string) => undefined, []);

    const createInstruction = useCallback<
        SystemInstructionsContextValue['createInstruction']
    >(async (title, content, options) => {
        const normalizedTitle = normalizeTitle(title);
        setSaving(true);
        try {
            const { data, error } = await (supabase as any)
                .from('system_instructions')
                .insert({
                    title: normalizedTitle,
                    content,
                    is_active: options?.activate ?? false,
                })
                .select('id, title, content, updated_at, created_at, is_active')
                .single();

            if (error) throw error;
            if (!data) return null;

            const instruction = mapRowToInstruction(data as InstructionRow);
            let updatedList: SystemInstruction[] = [];
            setInstructions((prev) => {
                const normalized = instruction.isActive
                    ? prev.map((item) => ({ ...item, isActive: false }))
                    : prev;
                updatedList = sortInstructions([...normalized, instruction]);
                return updatedList;
            });
            setActiveInstructionId(resolveActiveId(updatedList, instruction.isActive ? instruction.id : undefined));

            return instruction.id;
        } catch (error) {
            console.error('[SystemInstructions] Failed to create instruction', error);
            throw error;
        } finally {
            setSaving(false);
        }
    }, [resolveActiveId]);

    const updateInstruction = useCallback<
        SystemInstructionsContextValue['updateInstruction']
    >(async (id, title, content, options) => {
        const normalizedTitle = normalizeTitle(title);
        setSaving(true);
        try {
            const payload: Record<string, any> = {
                title: normalizedTitle,
                content,
            };
            if (typeof options?.activate === 'boolean') {
                payload.is_active = options.activate;
            }

            const { data, error } = await (supabase as any)
                .from('system_instructions')
                .update(payload)
                .eq('id', id)
                .select('id, title, content, updated_at, created_at, is_active')
                .single();

            if (error) throw error;
            if (!data) return;

            const instruction = mapRowToInstruction(data as InstructionRow);
            let updatedList: SystemInstruction[] = [];
            setInstructions((prev) => {
                const filtered = prev.filter((item) => item.id !== instruction.id);
                const normalized = instruction.isActive
                    ? filtered.map((item) => ({ ...item, isActive: false }))
                    : filtered;
                updatedList = sortInstructions([...normalized, instruction]);
                return updatedList;
            });
            setActiveInstructionId((current) => {
                if (instruction.isActive) {
                    return instruction.id;
                }
                if (current && updatedList.some((item) => item.id === current)) {
                    return current;
                }
                return resolveActiveId(updatedList);
            });
        } catch (error) {
            console.error('[SystemInstructions] Failed to update instruction', error);
            throw error;
        } finally {
            setSaving(false);
        }
    }, [resolveActiveId]);

    const deleteInstruction = useCallback<
        SystemInstructionsContextValue['deleteInstruction']
    >(async (id) => {
        setSaving(true);
        try {
            const { error } = await (supabase as any)
                .from('system_instructions')
                .delete()
                .eq('id', id);
            if (error) throw error;

            let updatedList: SystemInstruction[] = [];
            setInstructions((prev) => {
                updatedList = prev.filter((item) => item.id !== id);
                return updatedList;
            });
            setActiveInstructionId((current) => {
                if (current && current !== id) {
                    return current;
                }
                return resolveActiveId(updatedList);
            });
        } catch (error) {
            console.error('[SystemInstructions] Failed to delete instruction', error);
            throw error;
        } finally {
            setSaving(false);
        }
    }, [resolveActiveId]);

    const setActiveInstruction = useCallback<
        SystemInstructionsContextValue['setActiveInstruction']
    >(async (id) => {
        setSaving(true);
        try {
            const deactivate = (supabase as any)
                .from('system_instructions')
                .update({ is_active: false })
                .neq('id', id);
            const activate = (supabase as any)
                .from('system_instructions')
                .update({ is_active: true })
                .eq('id', id)
                .select('id, title, content, updated_at, created_at, is_active')
                .single();

            const [{ error: deactivateError }, { data, error: activateError }] = await Promise.all([
                deactivate,
                activate,
            ]);

            if (deactivateError) throw deactivateError;
            if (activateError) throw activateError;

            if (data) {
                const instruction = mapRowToInstruction(data as InstructionRow);
                let updatedList: SystemInstruction[] = [];
                setInstructions((prev) => {
                    const others = prev
                        .filter((item) => item.id !== instruction.id)
                        .map((item) => ({ ...item, isActive: false }));
                    updatedList = sortInstructions([...others, instruction]);
                    return updatedList;
                });
                setActiveInstructionId(resolveActiveId(updatedList, instruction.id));
            } else {
                await loadInstructions();
            }
        } catch (error) {
            console.error('[SystemInstructions] Failed to activate instruction', error);
            throw error;
        } finally {
            setSaving(false);
        }
    }, [loadInstructions, resolveActiveId]);

    const overwriteActiveInstruction = useCallback<
        SystemInstructionsContextValue['overwriteActiveInstruction']
    >(async (content) => {
        if (!activeInstructionId) return;
        const current = instructions.find((item) => item.id === activeInstructionId);
        if (!current) return;
        await updateInstruction(activeInstructionId, current.title, content, { activate: current.isActive });
    }, [activeInstructionId, instructions, updateInstruction]);

    const refreshActiveFromSupabase = useCallback(async () => {
        await loadInstructions();
    }, [loadInstructions]);

    const activeInstruction = useMemo(() => (
        activeInstructionId
            ? instructions.find((item) => item.id === activeInstructionId) ?? null
            : null
    ), [activeInstructionId, instructions]);

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
    ]);

    return (
        <SystemInstructionsContext.Provider value={contextValue}>
            {children}
        </SystemInstructionsContext.Provider>
    );
};
