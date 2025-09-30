import React, { useMemo, useState } from 'react';
import { useSystemInstructions } from '@/hooks/useSystemInstructions';
import { useContextSettings } from '@/hooks/useContextSettings';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
    ContextMode,
    MAX_CUSTOM_MESSAGE_COUNT,
    MIN_CUSTOM_MESSAGE_COUNT,
} from '@/hooks/contextSettingsProviderContext';

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

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

    const { mode, setMode, customMessageCount, setCustomMessageCount } = useContextSettings();

    const [selectedInstructionId, setSelectedInstructionId] = useState<string | null>(null);
    const [localTitle, setLocalTitle] = useState('');
    const [localContent, setLocalContent] = useState('');
    const [isEditingExisting, setIsEditingExisting] = useState(false);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [activeTab, setActiveTab] = useState<'system' | 'context'>('system');

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
        setActiveTab('system');
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

    const isActive = selectedInstruction?.id === activeInstructionId || (!selectedInstruction && selectedInstructionId === null);

    const canSave = localContent.trim().length > 0;

    const currentContextSummary = (() => {
        switch (mode) {
            case 'last8':
                return 'Sending the last 8 messages with each request.';
            case 'all-middle-out':
                return 'Sending the full conversation with automatic middle-out compression.';
            case 'custom':
                return `Sending the last ${customMessageCount} message${customMessageCount === 1 ? '' : 's'}.`;
            default:
                return '';
        }
    })();

    const handleModeChange = (value: string) => {
        if (value === 'last8' || value === 'all-middle-out' || value === 'custom') {
            setMode(value as ContextMode);
        }
    };

    const handleSliderChange = (values: number[]) => {
        if (values.length === 0) return;
        setCustomMessageCount(values[0]);
        setMode('custom');
    };

    const handleCustomInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.valueAsNumber;
        if (Number.isNaN(nextValue)) {
            setCustomMessageCount(MIN_CUSTOM_MESSAGE_COUNT);
            setMode('custom');
            return;
        }
        setCustomMessageCount(nextValue);
        setMode('custom');
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
                        Configure the prompts and context applied to every model request.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'system' | 'context')}>
                    <TabsList>
                        <TabsTrigger value="system">System Instructions</TabsTrigger>
                        <TabsTrigger value="context">Context</TabsTrigger>
                    </TabsList>

                    <TabsContent value="system" className="mt-4">
                        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                            <div className="flex flex-col gap-4 border-r pr-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium">Saved Instructions</p>
                                    <Button size="sm" variant="ghost" onClick={handleCreateNew} disabled={loading}>
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

                    <TabsContent value="context" className="mt-4">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <p className="text-sm font-medium">Conversation Context</p>
                                <p className="text-sm text-muted-foreground">
                                    Choose how much of the conversation history is sent with each request.
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    <span className="font-medium text-foreground">Current selection:</span> {currentContextSummary}
                                </p>
                            </div>
                            <RadioGroup value={mode} onValueChange={handleModeChange} className="space-y-4">
                                <label
                                    htmlFor="context-last8"
                                    className={cn(
                                        'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                                        mode === 'last8' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                                    )}
                                >
                                    <RadioGroupItem value="last8" id="context-last8" className="mt-1" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">Last 8</p>
                                        <p className="text-sm text-muted-foreground">
                                            Include only the eight most recent messages before your next prompt.
                                        </p>
                                    </div>
                                </label>

                                <label
                                    htmlFor="context-all-middle-out"
                                    className={cn(
                                        'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                                        mode === 'all-middle-out'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-primary/50'
                                    )}
                                >
                                    <RadioGroupItem value="all-middle-out" id="context-all-middle-out" className="mt-1" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">All (Middle Out)</p>
                                        <p className="text-sm text-muted-foreground">
                                            Send the entire conversation and automatically enable OpenRouter's middle-out compression.
                                        </p>
                                    </div>
                                </label>

                                <div
                                    className={cn(
                                        'space-y-4 rounded-lg border p-4 transition-colors',
                                        mode === 'custom' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                                    )}
                                >
                                    <label htmlFor="context-custom" className="flex cursor-pointer items-start gap-3">
                                        <RadioGroupItem value="custom" id="context-custom" className="mt-1" />
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">Custom</p>
                                            <p className="text-sm text-muted-foreground">
                                                Choose exactly how many recent messages to include in each request.
                                            </p>
                                        </div>
                                    </label>
                                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                                        <Slider
                                            value={[customMessageCount]}
                                            onValueChange={handleSliderChange}
                                            min={MIN_CUSTOM_MESSAGE_COUNT}
                                            max={MAX_CUSTOM_MESSAGE_COUNT}
                                            step={1}
                                        />
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                min={MIN_CUSTOM_MESSAGE_COUNT}
                                                max={MAX_CUSTOM_MESSAGE_COUNT}
                                                value={customMessageCount}
                                                onChange={handleCustomInputChange}
                                                className="w-24"
                                            />
                                            <span className="text-sm text-muted-foreground">messages</span>
                                        </div>
                                    </div>
                                </div>
                            </RadioGroup>
                            <p className="text-xs text-muted-foreground">
                                Your context choice is saved locally and applied to every new assistant response.
                            </p>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};

export default SettingsDialog;
