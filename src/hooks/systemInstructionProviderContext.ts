import { createContext } from 'react';

export interface SystemInstruction {
    id: string;
    title: string;
    content: string;
    updatedAt: string;
}

export interface SystemInstructionsContextValue {
    instructions: SystemInstruction[];
    activeInstructionId: string | null;
    activeInstruction: SystemInstruction | null;
    loading: boolean;
    saving: boolean;
    createInstruction: (title: string, content: string, options?: { activate?: boolean }) => Promise<string | null>;
    updateInstruction: (id: string, title: string, content: string, options?: { activate?: boolean }) => Promise<void>;
    deleteInstruction: (id: string) => Promise<void>;
    setActiveInstruction: (id: string) => Promise<void>;
    overwriteActiveInstruction: (content: string) => Promise<void>;
    refreshActiveFromSupabase: () => Promise<void>;
    recordInstructionUsage: (id: string) => void;
    getUsageCount: (id: string) => number;
    getUsageScore: (id: string) => number;
    usageCounts: Record<string, number>;
}

export const SystemInstructionsContext = createContext<SystemInstructionsContextValue | undefined>(undefined);
