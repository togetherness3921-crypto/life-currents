// This component will render a single chat message bubble
import React, { useState, useEffect } from 'react';
import { Message } from '@/hooks/chatProviderContext';
import { Button } from '../ui/button';
import { Pencil, Save, X, ChevronLeft, ChevronRight } from 'lucide-react';
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
    branchInfo?: {
        index: number;
        total: number;
        onPrev: () => void;
        onNext: () => void;
    };
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isStreaming, onSave, branchInfo }) => {
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

    const handleSave = () => {
        onSave(message.id, editText);
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditText('');
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
        <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`relative max-w-[75%] rounded-lg px-4 py-3 ${message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
            >
                <div className="absolute top-1 right-1 opacity-60 transition-opacity hover:opacity-100">
                    <Button
                        onClick={() => setIsEditing(true)}
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 p-0"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                </div>
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
            {branchInfo && branchInfo.total > 0 && (
                <div className="mt-2 flex items-center justify-center gap-3 text-xs text-muted-foreground">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={branchInfo.onPrev}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-2 py-1 rounded border border-muted-foreground/40">
                        {branchInfo.index + 1} / {branchInfo.total}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={branchInfo.onNext}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    );
};

export default ChatMessage;
