import { useContext } from 'react';
import { ConversationContext } from './conversationContextProviderContext';

export const useConversationContext = () => {
    const context = useContext(ConversationContext);
    if (!context) {
        throw new Error('useConversationContext must be used within a ConversationContextProvider');
    }
    return context;
};
