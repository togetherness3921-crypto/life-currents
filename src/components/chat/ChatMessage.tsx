// This component will render a single chat message bubble
import React, { useState, useEffect } from 'react';
import { Message } from '@/hooks/chatProviderContext';
import { Button } from '../ui/button';
import { Pencil, Save, X } from 'lucide-react';
import { Textarea } from '../ui/textarea';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

interface ChatMessageProps {
    message: Message;
    isStreaming?: boolean;
    onSave: (messageId: string, newContent: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isStreaming, onSave }) => {
    console.log('[ChatMessage] Rendering message:', { // LOG 8: Component render check
        id: message.id,
        content: message.content.length > 50 ? message.content.substring(0, 50) + '...' : message.content,
        isStreaming,
    });

    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');

    // When edit mode is activated, initialize editText with the current message content
    useEffect(() => {
        if (isEditing) {
            setEditText(message.content);
        }
    }, [isEditing, message.content]);

    const isUser = message.role === 'user';

    const handleSave = () => {
        onSave(message.id, editText);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditText(message.content);
        setIsEditing(false);
    };

    if (isUser && isEditing) {
        return (
            <div className="flex justify-end">
                <div className="w-[75%] space-y-2">
                    <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full"
                    />
                    <div className="flex justify-end gap-2">
                        <Button onClick={handleCancel} variant="ghost" size="sm">
                            <X className="mr-1 h-4 w-4" /> Cancel
                        </Button>
                        <Button onClick={handleSave} size="sm">
                            <Save className="mr-1 h-4 w-4" /> Save & Submit
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`group relative flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            {isUser && (
                <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 pr-2 opacity-50 transition-opacity hover:opacity-100">
                    <Button
                        onClick={() => setIsEditing(true)}
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                    >
                        <Pencil className="h-3 w-3" />
                    </Button>
                </div>
            )}
            <div
                className={`max-w-[75%] rounded-lg px-4 py-2 ${
                    isUser
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                }`}
            >
                {(isStreaming || (message.thinking && message.thinking.trim().length > 0)) && (
                    <Accordion type="single" collapsible className="w-full mb-2">
                        <AccordionItem value="item-1" className="border-b border-muted-foreground/20">
                            <AccordionTrigger className="text-xs">Thinking...</AccordionTrigger>
                            <AccordionContent className="text-xs whitespace-pre-wrap">
                                {message.thinking?.trim().length ? message.thinking : 'The model is generating a response...'}
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}
                <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
        </div>
    );
};

export default ChatMessage;
