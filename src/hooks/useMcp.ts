import { useContext } from 'react';
import { McpContext } from './mcpProviderContext';

export const useMcp = () => {
    const context = useContext(McpContext);
    if (!context) {
        throw new Error('useMcp must be used within an McpProvider');
    }
    return context;
};

