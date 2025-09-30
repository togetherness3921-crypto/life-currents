import React, { useEffect, useMemo, useState } from 'react';
import { useSystemInstructions } from '@/hooks/useSystemInstructions';
import { useContextSettings, ContextMode } from '@/hooks/useContextSettings';
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

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const MAX_CUSTOM_MESSAGES = 200;

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
    const { settings: contextSettings, setMode, setCustomMessageCount } = useContextSettings();

    const [selectedInstructionId, setSelectedInstructionId] = useState<string | null>(null);
    const [localTitle, setLocalTitle] = useState('');
    const [localContent, setLocalContent] = useState('');
    const [isEditingExisting, setIsEditingExisting] = useState(false);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [activeTab, setActiveTab] = useState<'system' | 'context'>('system');
    const [customInputValue, setCustomInputValue] = useState<string>(() => String(contextSettings.customMessageCount));

    useEffect(() => {
        setCustomInputValue(String(contextSettings.customMessageCount));
    }, [contextSettings.customMessageCount]);

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
        setActiveTab('system');
    };

    const handleDelete = async () => {
        const target = selectedInstruction ?? activeInstruction;
        if (!target) return;
        if (instructions.length <= 1) return;
        await deleteInstruction(target.id);
        resetForm();
    };

    const handleDialogOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            resetForm();
            setActiveTab('system');
        }
        onOpenChange(nextOpen);
    };

    const handleCustomNumberChange = (value: string) => {
        setCustomInputValue(value);
        if (value === '') return;
        const parsed = Number(value);
        if (Number.isNaN(parsed)) return;
        setCustomMessageCount(parsed);
    };

    const handleCustomNumberBlur = () => {
        if (customInputValue === '') {
            setCustomInputValue(String(contextSettings.customMessageCount));
            return;
        }
        const parsed = Number(customInputValue);
        if (Number.isNaN(parsed)) {
            setCustomInputValue(String(contextSettings.customMessageCount));
            return;
        }
        setCustomMessageCount(parsed);
    };

    const isActive =
        selectedInstruction?.id === activeInstructionId || (!selectedInstruction && selectedInstructionId === null);

    const canSave = localContent.trim().length > 0;

    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Configure system instructions and control how much conversation history is sent with each message.
                    </DialogDescription>
                </DialogHeader>
                <Tabs
                    value={activeTab}
                    onValueChange={(value) => setActiveTab(value === 'context' ? 'context' : 'system')}
                >
                    <TabsList>
                        <TabsTrigger value="system">System Instructions</TabsTrigger>
                        <TabsTrigger value="context">Context</TabsTrigger>
                    </TabsList>
                    <TabsContent value="system">
                        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                            <div className="flex flex-col gap-4 border-r pr-4">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium">Saved Instructions</p>
                                    <Button size="sm" variant="ghost" onClick={handleCreateNew} disabled={loading || saving}>
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
                                                disabled={loading || saving}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium">{instruction.title}</span>
                                                    {instruction.id === activeInstructionId && (
                                                        <span className="text-xs text-primary">Active</span>
                                                    )}
                                                </div>
                                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                    {instruction.content}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                            <div className="flex flex-col gap-4">
                                <div>
                                    <Input
                                        value={displayTitle}
                                        onChange={(event) => {
                                            setLocalTitle(event.target.value);
                                            if (!isEditingExisting) {
                                                setIsEditingExisting(true);
                                            }
                                        }}
                                        placeholder="Instruction title"
                                        disabled={loading || saving}
                                    />
                                </div>
                                <Textarea
                                    className="min-h-[300px]"
                                    value={displayContent}
                                    onChange={(event) => {
                                        setLocalContent(event.target.value);
                                        if (!isEditingExisting) {
                                            setIsEditingExisting(true);
                                        }
                                    }}
                                    disabled={loading || saving}
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button onClick={handleSave} disabled={!canSave || saving}>
                                        {isCreatingNew ? 'Create & Activate' : 'Save & Activate'}
                                    </Button>
                                    <Button variant="secondary" onClick={handleActivate} disabled={!selectedInstruction}>
                                        Activate
                                    </Button>
                                    <Button variant="outline" onClick={handleEdit} disabled={!selectedInstruction || saving}>
                                        Edit
                                    </Button>
                                    <Button variant="ghost" onClick={handleCancelEdit} disabled={loading || saving}>
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={handleDelete}
                                        disabled={instructions.length <= 1 || saving}
                                    >
                                        Delete
                                    </Button>
                                    {loading && <span className="text-sm text-muted-foreground">Loading presets…</span>}
                                    {saving && <span className="text-sm text-muted-foreground">Saving…</span>}
                                    {isActive && (
                                        <span className="ml-auto text-sm text-primary">Currently active preset</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="context">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <h3 className="text-lg font-semibold">Conversation Context</h3>
                                <p className="text-sm text-muted-foreground">
                                    Choose how much of the existing conversation is sent with each new message. Shorter histories reduce
                                    token usage, while longer ones preserve more context. Your selection is saved for future sessions.
                                </p>
                            </div>
                            <RadioGroup
                                value={contextSettings.mode}
                                onValueChange={(value) => setMode(value as ContextMode)}
                                className="space-y-4"
                            >
                                <label
                                    htmlFor="context-last-8"
                                    className={cn(
                                        'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                                        contextSettings.mode === 'last-8'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-muted-foreground/50'
                                    )}
                                >
                                    <RadioGroupItem id="context-last-8" value="last-8" className="mt-1" />
                                    <div>
                                        <p className="text-sm font-medium">Last 8</p>
                                        <p className="text-sm text-muted-foreground">
                                            Include only the eight most recent messages before your new prompt.
                                        </p>
                                    </div>
                                </label>

                                <label
                                    htmlFor="context-all"
                                    className={cn(
                                        'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                                        contextSettings.mode === 'all-middle-out'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-muted-foreground/50'
                                    )}
                                >
                                    <RadioGroupItem id="context-all" value="all-middle-out" className="mt-1" />
                                    <div>
                                        <p className="text-sm font-medium">All (Middle Out)</p>
                                        <p className="text-sm text-muted-foreground">
                                            Send the full conversation and enable OpenRouter&apos;s middle-out compression for long
                                            threads.
                                        </p>
                                    </div>
                                </label>

                                <label
                                    htmlFor="context-custom"
                                    className={cn(
                                        'flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors sm:flex-row sm:items-start sm:gap-4',
                                        contextSettings.mode === 'custom'
                                            ? 'border-primary bg-primary/5'
                                            : 'border-border hover:border-muted-foreground/50'
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <RadioGroupItem id="context-custom" value="custom" className="mt-1" />
                                        <div>
                                            <p className="text-sm font-medium">Custom</p>
                                            <p className="text-sm text-muted-foreground">
                                                Pick exactly how many recent messages to include using the slider or number input.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="w-full space-y-3 sm:max-w-xs">
                                        <Slider
                                            min={1}
                                            max={MAX_CUSTOM_MESSAGES}
                                            step={1}
                                            value={[Math.min(contextSettings.customMessageCount, MAX_CUSTOM_MESSAGES)]}
                                            onValueChange={(value) => setCustomMessageCount(value[0] ?? 1)}
                                            onPointerDown={() => setMode('custom')}
                                        />
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                min={1}
                                                max={MAX_CUSTOM_MESSAGES}
                                                value={customInputValue}
                                                onChange={(event) => {
                                                    setMode('custom');
                                                    handleCustomNumberChange(event.target.value);
                                                }}
                                                onBlur={handleCustomNumberBlur}
                                            />
                                            <span className="text-sm text-muted-foreground">messages</span>
                                        </div>
                                    </div>
                                </label>
                            </RadioGroup>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};

export default SettingsDialog;
