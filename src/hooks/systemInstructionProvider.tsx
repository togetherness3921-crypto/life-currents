import { createContext, useCallback, useEffect, useMemo, useState, ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    SystemInstruction,
    SystemInstructionContext,
    SystemInstructionContextValue,
    createDefaultInstruction,
} from './systemInstructionContext';

export interface SystemInstruction {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
}

interface SystemInstructionContextValue {
    instructions: SystemInstruction[];
    activeInstructionId: string;
    activeInstruction?: SystemInstruction;
    setActiveInstruction: (id: string) => void;
    createInstruction: () => string;
    updateInstruction: (id: string, updates: { title?: string; content?: string }) => void;
}

const STORAGE_KEY = 'system_instruction_store_v1';

const loadInitialState = (): { instructions: SystemInstruction[]; activeInstructionId: string } => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { instructions?: SystemInstruction[]; activeInstructionId?: string };
            const instructions = Array.isArray(parsed.instructions) && parsed.instructions.length > 0
                ? parsed.instructions.map((instruction) => ({
                    ...instruction,
                    createdAt: instruction.createdAt ?? new Date().toISOString(),
                    updatedAt: instruction.updatedAt ?? new Date().toISOString(),
                }))
                : [createDefaultInstruction()];
            const activeInstructionId = instructions.some((instruction) => instruction.id === parsed.activeInstructionId)
                ? (parsed.activeInstructionId as string)
                : instructions[0].id;
            return { instructions, activeInstructionId };
        }
    } catch (error) {
        console.error('Failed to parse system instruction state from localStorage', error);
    }

    const defaultInstruction = createDefaultInstruction();
    return {
        instructions: [defaultInstruction],
        activeInstructionId: defaultInstruction.id,
    };
};

export const SystemInstructionProvider = ({ children }: { children: ReactNode }) => {
    const initialState = useMemo(loadInitialState, []);
    const [instructions, setInstructions] = useState<SystemInstruction[]>(initialState.instructions);
    const [activeInstructionId, setActiveInstructionId] = useState<string>(initialState.activeInstructionId);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ instructions, activeInstructionId }));
    }, [instructions, activeInstructionId]);

    const activeInstruction = useMemo(
        () => instructions.find((instruction) => instruction.id === activeInstructionId),
        [instructions, activeInstructionId]
    );

    const setActiveInstruction = useCallback(
        (id: string) => {
            if (instructions.some((instruction) => instruction.id === id)) {
                setActiveInstructionId(id);
            }
        },
        [instructions]
    );

    const createInstruction = useCallback(() => {
        const now = new Date().toISOString();
        const newInstruction: SystemInstruction = {
            id: uuidv4(),
            title: 'Untitled Instruction',
            content: '',
            createdAt: now,
            updatedAt: now,
        };
        setInstructions((prev) => [...prev, newInstruction]);
        setActiveInstructionId(newInstruction.id);
        return newInstruction.id;
    }, []);

    const updateInstruction = useCallback((id: string, updates: { title?: string; content?: string }) => {
        setInstructions((prev) =>
            prev.map((instruction) =>
                instruction.id === id
                    ? {
                        ...instruction,
                        title: updates.title !== undefined ? (updates.title.trim() || 'Untitled Instruction') : instruction.title,
                        content: updates.content !== undefined ? updates.content : instruction.content,
                        updatedAt: new Date().toISOString(),
                    }
                    : instruction
            )
        );
    }, []);

    const value: SystemInstructionContextValue = useMemo(
        () => ({
            instructions,
            activeInstructionId,
            activeInstruction,
            setActiveInstruction,
            createInstruction,
            updateInstruction,
        }),
        [instructions, activeInstructionId, activeInstruction, setActiveInstruction, createInstruction, updateInstruction]
    );

    return <SystemInstructionContext.Provider value={value}>{children}</SystemInstructionContext.Provider>;
};
