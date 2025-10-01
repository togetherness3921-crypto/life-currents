import { useContext } from 'react';
import { LayoutPersistenceContext } from './layoutPersistenceContext';

export const useLayoutPersistence = () => {
    const context = useContext(LayoutPersistenceContext);
    if (!context) {
        throw new Error('useLayoutPersistence must be used within a LayoutPersistenceProvider');
    }
    return context;
};
