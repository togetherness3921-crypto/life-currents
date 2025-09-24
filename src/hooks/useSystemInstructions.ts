import { useContext } from 'react';
import { SystemInstructionsContext } from './systemInstructionProviderContext';

export const useSystemInstructions = () => {
    const context = useContext(SystemInstructionsContext);
    if (!context) {
        throw new Error('useSystemInstructions must be used within a SystemInstructionsProvider');
    }
    return context;
};

