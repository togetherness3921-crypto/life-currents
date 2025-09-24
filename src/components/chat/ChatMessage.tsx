// This component will render a single chat message bubble
import React from 'react';
import { Message } from '@/hooks/useChat';
import { Button } from '../ui/button';
import { Pencil } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div className={`group relative flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {isUser && (
        <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 pr-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-6 w-6">
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
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
};

export default ChatMessage;
