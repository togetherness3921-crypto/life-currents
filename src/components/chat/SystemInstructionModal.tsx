import { useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useSystemInstruction } from '@/hooks/useSystemInstruction';

interface SystemInstructionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const SystemInstructionModal: React.FC<SystemInstructionModalProps> = ({ open, onOpenChange }) => {
    const {
        instructions,
        activeInstructionId,
        activeInstruction,
        setActiveInstruction,
        createInstruction,
        updateInstruction,
    } = useSystemInstruction();

    const [draftTitle, setDraftTitle] = useState('');
    const [draftContent, setDraftContent] = useState('');

    useEffect(() => {
        if (activeInstruction) {
            setDraftTitle(activeInstruction.title);
            setDraftContent(activeInstruction.content);
        }
    }, [activeInstruction, open]);

    const instructionCount = useMemo(() => instructions.length, [instructions.length]);

    const handleSave = () => {
        if (!activeInstruction) return;
        updateInstruction(activeInstruction.id, {
            title: draftTitle,
            content: draftContent,
        });
    };

    const handleCreate = () => {
        const newId = createInstruction();
        setActiveInstruction(newId);
        setDraftTitle('Untitled Instruction');
        setDraftContent('');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl p-0 sm:p-0">
                <div className="grid h-[70vh] grid-cols-[220px_1fr]">
                    <aside className="border-r bg-muted/40 p-4">
                        <DialogHeader>
                            <DialogTitle className="text-sm font-semibold">System Instructions</DialogTitle>
                            <DialogDescription className="text-xs">
                                Manage saved instructions and choose which one is active.
                            </DialogDescription>
                        </DialogHeader>
                        <Button size="sm" className="mt-4 w-full" onClick={handleCreate}>
                            New Instruction
                        </Button>
                        <ScrollArea className="mt-4 h-[calc(70vh-160px)]">
                            <div className="space-y-1">
                                {instructions.map((instruction) => {
                                    const isActive = instruction.id === activeInstructionId;
                                    return (
                                        <button
                                            key={instruction.id}
                                            type="button"
                                            onClick={() => setActiveInstruction(instruction.id)}
                                            className={cn(
                                                'w-full rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors',
                                                isActive
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-background hover:bg-muted'
                                            )}
                                        >
                                            <div className="font-medium line-clamp-1">{instruction.title}</div>
                                            <div className="text-xs text-muted-foreground line-clamp-1">
                                                Updated {new Date(instruction.updatedAt).toLocaleString()}
                                            </div>
                                        </button>
                                    );
                                })}
                                {instructionCount === 0 && (
                                    <p className="text-xs text-muted-foreground">No instructions yet. Create one to get started.</p>
                                )}
                            </div>
                        </ScrollArea>
                    </aside>
                    <div className="flex flex-col gap-4 p-6">
                        {activeInstruction ? (
                            <>
                                <div className="grid gap-2">
                                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Title
                                    </label>
                                    <Input
                                        value={draftTitle}
                                        onChange={(event) => setDraftTitle(event.target.value)}
                                        placeholder="Enter a descriptive title"
                                    />
                                </div>
                                <div className="grid flex-1 gap-2">
                                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Instruction
                                    </label>
                                    <Textarea
                                        className="h-full min-h-[260px] flex-1"
                                        value={draftContent}
                                        onChange={(event) => setDraftContent(event.target.value)}
                                        placeholder="Write the system instruction"
                                    />
                                </div>
                                <div className="flex justify-end gap-2 pb-4">
                                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                                        Close
                                    </Button>
                                    <Button onClick={handleSave}>Save Instruction</Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                                Select or create a system instruction to edit it.
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SystemInstructionModal;
