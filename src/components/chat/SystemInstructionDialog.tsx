import React, { useMemo, useState } from 'react';
import { useSystemInstructions } from '@/hooks/useSystemInstructions';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface SystemInstructionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const SystemInstructionDialog: React.FC<SystemInstructionDialogProps> = ({ open, onOpenChange }) => {
    const {
        instructions,
        activeInstructionId,
        activeInstruction,
        loading,
        saving,
        setActiveInstruction,
        updateInstruction,
        createInstruction,
        deleteInstruction,
        overwriteActiveInstruction,
    } = useSystemInstructions();

    const [selectedInstructionId, setSelectedInstructionId] = useState<string | null>(null);
    const [localTitle, setLocalTitle] = useState('');
    const [localContent, setLocalContent] = useState('');
    const [isEditingExisting, setIsEditingExisting] = useState(false);
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    const selectedInstruction = useMemo(() => {
        if (isCreatingNew) {
            return null;
        }
        const targetId = selectedInstructionId ?? activeInstructionId;
        return instructions.find((instruction) => instruction.id === targetId) ?? activeInstruction;
    }, [activeInstruction, activeInstructionId, instructions, isCreatingNew, selectedInstructionId]);

    const displayTitle = isEditingExisting
        ? localTitle
        : selectedInstruction?.title ?? activeInstruction?.title ?? '';

    const displayContent = isEditingExisting
        ? localContent
        : selectedInstruction?.content ?? activeInstruction?.content ?? '';

    const resetForm = () => {
        setSelectedInstructionId(null);
        setLocalTitle('');
        setLocalContent('');
        setIsEditingExisting(false);
        setIsCreatingNew(false);
    };

    const handleSelectInstruction = (id: string) => {
        setSelectedInstructionId(id);
        const instruction = instructions.find((item) => item.id === id);
        if (!instruction) return;
        setLocalTitle(instruction.title);
        setLocalContent(instruction.content);
        setIsEditingExisting(false);
        setIsCreatingNew(false);
    };

    const handleCreateNew = () => {
        setSelectedInstructionId(null);
        setLocalTitle('Untitled Instruction');
        setLocalContent(activeInstruction?.content ?? '');
        setIsCreatingNew(true);
        setIsEditingExisting(true);
    };

    const handleEdit = () => {
        if (!selectedInstruction) return;
        setLocalTitle(selectedInstruction.title);
        setLocalContent(selectedInstruction.content);
        setIsEditingExisting(true);
    };

    const handleCancelEdit = () => {
        resetForm();
    };

    const handleSave = async () => {
        if (isCreatingNew) {
            const newId = await createInstruction(localTitle, localContent, { activate: true });
            setSelectedInstructionId(newId);
        } else if (selectedInstruction) {
            await updateInstruction(selectedInstruction.id, localTitle, localContent, { activate: true });
        } else if (activeInstructionId) {
            await overwriteActiveInstruction(localContent);
        }
        setIsEditingExisting(false);
        setIsCreatingNew(false);
    };

    const handleActivate = async () => {
        const target = selectedInstruction ?? activeInstruction;
        if (!target) return;
        await setActiveInstruction(target.id);
        onOpenChange(false);
        resetForm();
    };

    const handleDelete = async () => {
        const target = selectedInstruction ?? activeInstruction;
        if (!target) return;
        if (instructions.length <= 1) return;
        await deleteInstruction(target.id);
        resetForm();
    };

    const isActive = selectedInstruction?.id === activeInstructionId || (!selectedInstruction && selectedInstructionId === null);

    const canSave = localContent.trim().length > 0;

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            if (!nextOpen) {
                resetForm();
            }
            onOpenChange(nextOpen);
        }}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>System Instructions</DialogTitle>
                    <DialogDescription>
                        Manage the prompt sent with every message. Updating an instruction activates it immediately for the next request.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                    <div className="flex flex-col gap-4 border-r pr-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Saved Instructions</p>
                            <Button size="sm" variant="ghost" onClick={handleCreateNew}>
                                New
                            </Button>
                        </div>
                        <ScrollArea className="flex-1">
                            <div className="flex flex-col gap-2">
                                {instructions.map((instruction) => (
                                    <button
                                        key={instruction.id}
                                        type="button"
                                        onClick={() => handleSelectInstruction(instruction.id)}
                                        className={cn(
                                            'rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                                            instruction.id === (selectedInstructionId ?? activeInstructionId)
                                                ? 'border-primary bg-primary/5'
                                                : 'border-transparent'
                                        )}
                                    >
                                        <p className="font-medium">{instruction.title}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {instruction.updatedAt ? new Date(instruction.updatedAt).toLocaleString() : ''}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">
                                    {selectedInstruction?.title || (isCreatingNew ? 'New Instruction' : activeInstruction?.title) || 'No instruction selected'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {isActive ? 'Active instruction' : 'Inactive'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {!isEditingExisting && !loading && (
                                    <Button size="sm" variant="outline" onClick={handleEdit} disabled={!selectedInstruction && !activeInstruction}>
                                        Edit
                                    </Button>
                                )}
                                <Button size="sm" onClick={handleActivate} disabled={!selectedInstruction && !activeInstruction}>
                                    Use This Instruction
                                </Button>
                                <Button size="sm" variant="destructive" onClick={handleDelete} disabled={!selectedInstruction && !activeInstruction}>
                                    Delete
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Input
                                    value={displayTitle}
                                    onChange={(event) => setLocalTitle(event.target.value)}
                                    placeholder="Instruction title"
                                    disabled={!isEditingExisting}
                                />
                                {isEditingExisting && (
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                                            Cancel
                                        </Button>
                                        <Button size="sm" onClick={handleSave} disabled={!canSave || saving}>
                                            {saving ? 'Saving...' : 'Save & Activate'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                            <Textarea
                                value={displayContent}
                                onChange={(event) => setLocalContent(event.target.value)}
                                rows={20}
                                disabled={!isEditingExisting}
                                className="font-mono text-sm"
                            />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SystemInstructionDialog;

