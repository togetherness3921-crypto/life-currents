import { createContext } from 'react';
import { systemInstructions as defaultInstructionContent } from '../../synced_files/system_instructions';

export interface SystemInstruction {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
}

export const createDefaultInstruction = (): SystemInstruction => {
    const now = new Date().toISOString();
    return {
        id: 'default-instruction',
        title: 'Default System Instruction',
        content: defaultInstructionContent,
        createdAt: now,
        updatedAt: now,
    };
};

export interface SystemInstructionContextValue {
    instructions: SystemInstruction[];
    activeInstructionId: string;
    activeInstruction?: SystemInstruction;
    setActiveInstruction: (id: string) => void;
    createInstruction: () => string;
    updateInstruction: (id: string, updates: { title?: string; content?: string }) => void;
}

export const SystemInstructionContext = createContext<SystemInstructionContextValue | undefined>(undefined);
