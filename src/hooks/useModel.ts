import { useContext } from 'react';
import { ModelContext } from './modelProviderContext';

export const useModel = () => {
    const context = useContext(ModelContext);
    if (!context) {
        throw new Error('useModel must be used within a ModelProvider');
    }
    return context;
};
