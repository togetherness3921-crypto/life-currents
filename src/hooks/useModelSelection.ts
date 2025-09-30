import { useContext } from 'react';
import { ModelSelectionContext } from './modelSelectionProviderContext';

export const useModelSelection = () => {
    const context = useContext(ModelSelectionContext);
    if (!context) {
        throw new Error('useModelSelection must be used within a ModelSelectionProvider');
    }
    return context;
};

export default useModelSelection;

