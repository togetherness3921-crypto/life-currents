// This component will render a single chat message bubble
import React, { useState } from 'react';
import { Message } from '@/hooks/chatProvider';
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
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(message.content);

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
                <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 pr-2 opacity-0 transition-opacity group-hover:opacity-100">
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
                className={`max-w-[75%] rounded-lg px-4 py-2 ${isUser
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
            >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {isStreaming && (
                    <Accordion type="single" collapsible className="w-full mt-2">
                        <AccordionItem value="item-1" className="border-t border-muted-foreground/20">
                            <AccordionTrigger className="text-xs pt-2">Thinking...</AccordionTrigger>
                            <AccordionContent className="text-xs">
                                The model is generating a response...
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}
            </div>
        </div>
    );
};

export default ChatMessage;
