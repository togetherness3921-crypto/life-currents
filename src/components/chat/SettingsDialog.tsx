import React, { useMemo, useState, useEffect } from 'react';
import { useSystemInstructions } from '@/hooks/useSystemInstructions';
import { useConversationContext } from '@/hooks/useConversationContext';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const MIN_CUSTOM_COUNT = 1;
const MAX_CUSTOM_COUNT = 100;

const clampCount = (value: number) => {
    if (Number.isNaN(value)) return MIN_CUSTOM_COUNT;
    return Math.min(MAX_CUSTOM_COUNT, Math.max(MIN_CUSTOM_COUNT, Math.round(value)));
};

const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onOpenChange }) => {
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

    const {
        mode: contextMode,
        customMessageCount,
        setMode: setContextMode,
        setCustomMessageCount,
    } = useConversationContext();

    const [selectedInstructionId, setSelectedInstructionId] = useState<string | null>(null);
    const [localTitle, setLocalTitle] = useState('');
    const [localContent, setLocalContent] = useState('');
    const [isEditingExisting, setIsEditingExisting] = useState(false);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [localCustomCount, setLocalCustomCount] = useState(customMessageCount);

    useEffect(() => {
        setLocalCustomCount(customMessageCount);
    }, [customMessageCount]);

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
            if (newId) {
                setSelectedInstructionId(newId);
            }
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

    const isActive =
        selectedInstruction?.id === activeInstructionId || (!selectedInstruction && selectedInstructionId === null);

    const canSave = localContent.trim().length > 0;

    const handleContextSelection = (value: string) => {
        if (value === 'last8' || value === 'all' || value === 'custom') {
            setContextMode(value);
        }
    };

    const handleCustomCountChange = (value: number) => {
        const clamped = clampCount(value);
        setLocalCustomCount(clamped);
        setCustomMessageCount(clamped);
        if (contextMode !== 'custom') {
            setContextMode('custom');
        }
    };

    const handleCustomInputBlur = () => {
        handleCustomCountChange(localCustomCount);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    resetForm();
                }
                onOpenChange(nextOpen);
            }}
        >
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Configure the system prompt and control how much conversation history is sent with each request.
                    </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="system" className="flex flex-col gap-6">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="system">System Instructions</TabsTrigger>
                        <TabsTrigger value="context">Context</TabsTrigger>
                    </TabsList>
                    <TabsContent value="system" className="mt-0">
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
                                            {selectedInstruction?.title || (isCreatingNew ? 'New Instruction' : activeInstruction?.title) ||
                                                'No instruction selected'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {isActive ? 'Active instruction' : 'Inactive'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!isEditingExisting && !loading && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={handleEdit}
                                                disabled={!selectedInstruction && !activeInstruction}
                                            >
                                                Edit
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            onClick={handleActivate}
                                            disabled={!selectedInstruction && !activeInstruction}
                                        >
                                            Use This Instruction
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={handleDelete}
                                            disabled={!selectedInstruction && !activeInstruction}
                                        >
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
                    </TabsContent>
                    <TabsContent value="context" className="mt-0">
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-sm font-medium">Conversation Context</h3>
                                <p className="text-sm text-muted-foreground">
                                    Choose how much of the conversation history is sent with each new request. Fewer messages reduce token
                                    usage, while the full history enables maximum continuity.
                                </p>
                            </div>
                            <RadioGroup value={contextMode} onValueChange={handleContextSelection} className="space-y-4">
                                <div className={cn(
                                    'flex items-center justify-between rounded-lg border p-4 transition-colors',
                                    contextMode === 'last8' ? 'border-primary bg-primary/5' : 'border-border'
                                )}
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <RadioGroupItem id="context-last8" value="last8" />
                                            <Label htmlFor="context-last8" className="font-medium">
                                                Last 8
                                            </Label>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Send only the eight most recent messages before your new prompt.
                                        </p>
                                    </div>
                                </div>
                                <div className={cn(
                                    'flex items-center justify-between rounded-lg border p-4 transition-colors',
                                    contextMode === 'all' ? 'border-primary bg-primary/5' : 'border-border'
                                )}
                                >
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <RadioGroupItem id="context-all" value="all" />
                                            <Label htmlFor="context-all" className="font-medium">
                                                All (Middle Out)
                                            </Label>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Include the entire conversation and let OpenRouter compress it automatically when needed.
                                        </p>
                                    </div>
                                </div>
                                <div className={cn(
                                    'space-y-4 rounded-lg border p-4 transition-colors',
                                    contextMode === 'custom' ? 'border-primary bg-primary/5' : 'border-border'
                                )}
                                >
                                    <div className="flex items-center gap-2">
                                        <RadioGroupItem id="context-custom" value="custom" />
                                        <Label htmlFor="context-custom" className="font-medium">
                                            Custom
                                        </Label>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Choose the exact number of recent messages to include in each request.
                                    </p>
                                    <div className="space-y-4 rounded-md border border-dashed p-4">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-center">
                                            <div className="flex-1">
                                                <Slider
                                                    value={[localCustomCount]}
                                                    min={MIN_CUSTOM_COUNT}
                                                    max={MAX_CUSTOM_COUNT}
                                                    step={1}
                                                    onValueChange={(value) => handleCustomCountChange(value[0] ?? MIN_CUSTOM_COUNT)}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Label htmlFor="context-custom-count" className="text-sm text-muted-foreground">
                                                    Messages
                                                </Label>
                                                <Input
                                                    id="context-custom-count"
                                                    type="number"
                                                    min={MIN_CUSTOM_COUNT}
                                                    max={MAX_CUSTOM_COUNT}
                                                    value={localCustomCount}
                                                    onChange={(event) => setLocalCustomCount(clampCount(Number(event.target.value)))}
                                                    onBlur={handleCustomInputBlur}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Enter') {
                                                            event.preventDefault();
                                                            handleCustomInputBlur();
                                                        }
                                                    }}
                                                    className="w-24"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            The selected number will include the most recent messages leading up to your new prompt.
                                        </p>
                                    </div>
                                </div>
                            </RadioGroup>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};

export default SettingsDialog;
