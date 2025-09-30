import { useContext } from 'react';
import { ModelPreferenceContext } from './modelPreferenceProviderContext';

export const useModelPreference = () => {
    const context = useContext(ModelPreferenceContext);
    if (!context) {
        throw new Error('useModelPreference must be used within a ModelPreferenceProvider');
    }
    return context;
};

export default useModelPreference;
