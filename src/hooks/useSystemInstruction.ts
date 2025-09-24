import { useContext } from 'react';
import { SystemInstructionContext } from './systemInstructionProvider';

export const useSystemInstruction = () => {
    const ctx = useContext(SystemInstructionContext);
    if (!ctx) {
        throw new Error('useSystemInstruction must be used within a SystemInstructionProvider');
    }
    return ctx;
};
