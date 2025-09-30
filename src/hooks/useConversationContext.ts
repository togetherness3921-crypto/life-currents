import { useContext } from 'react';
import { ConversationContextSettingsContext } from './conversationContextProviderContext';

export const useConversationContext = () => {
    const context = useContext(ConversationContextSettingsContext);
    if (!context) {
        throw new Error('useConversationContext must be used within a ConversationContextProvider');
    }
    return context;
};
