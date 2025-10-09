import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pin, Plus, Trash2 } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useConversationContext } from '@/hooks/useConversationContext';
import type { ConversationContextMode } from '@/hooks/conversationContextProviderContext';
import useModelSelection from '@/hooks/useModelSelection';
import { getAvailableModels, type ModelInfo } from '@/services/openRouter';
import { Toggle } from '@/components/ui/toggle';
import { useToast } from '@/hooks/use-toast';

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const CUSTOM_MIN = 1;
const CUSTOM_MAX = 200;

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
        getUsageScore: getInstructionUsageScore,
    } = useSystemInstructions();
    const {
        mode,
        setMode,
        customMessageCount,
        setCustomMessageCount,
    } = useConversationContext();
    const {
        selectedModel,
        setSelectedModel,
        getUsageScore: getModelUsageScore,
        getToolIntentCheck,
        setToolIntentCheck,
    } = useModelSelection();

    const [selectedInstructionId, setSelectedInstructionId] = useState<string | null>(null);
    const [localTitle, setLocalTitle] = useState('');
    const [localContent, setLocalContent] = useState('');
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [editingContent, setEditingContent] = useState(false);
    const [activeTab, setActiveTab] = useState<'system' | 'context' | 'model'>('system');
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [modelSearchTerm, setModelSearchTerm] = useState('');
    const [modelLoading, setModelLoading] = useState(false);
    const [modelError, setModelError] = useState<string | null>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (!open || activeTab !== 'model' || modelsLoaded) {
            return;
        }

        let isMounted = true;
        setModelLoading(true);
        setModelError(null);

        getAvailableModels()
            .then((fetched) => {
                if (!isMounted) return;
                setModels(fetched);
                setModelsLoaded(true);
            })
            .catch((err) => {
                if (!isMounted) return;
                setModelError(err instanceof Error ? err.message : 'Failed to load models');
            })
            .finally(() => {
                if (!isMounted) return;
                setModelLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [activeTab, modelsLoaded, open]);

    const selectedInstruction = useMemo(() => {
        if (isCreatingNew) {
            return null;
        }
        const targetId = selectedInstructionId ?? activeInstructionId;
        return instructions.find((instruction) => instruction.id === targetId) ?? activeInstruction;
    }, [activeInstruction, activeInstructionId, instructions, isCreatingNew, selectedInstructionId]);

    const resetForm = () => {
        setSelectedInstructionId(null);
        setLocalTitle('');
        setLocalContent('');
        setIsCreatingNew(false);
        setEditingTitle(false);
        setEditingContent(false);
        setActiveTab('system');
        setModelSearchTerm('');
    };

    const handleSelectInstruction = (id: string) => {
        setIsCreatingNew(false);
        setEditingTitle(false);
        setEditingContent(false);
        setSelectedInstructionId(id);
        const instruction = instructions.find((item) => item.id === id);
        if (instruction) {
            setLocalTitle(instruction.title);
            setLocalContent(instruction.content);
        }
        setActiveTab('system');
        void setActiveInstruction(id).catch((error) => {
            const message = error instanceof Error ? error.message : 'Failed to activate instruction.';
            console.error('[SettingsDialog] Failed to activate instruction', error);
            toast({
                variant: 'destructive',
                title: 'Unable to activate instruction',
                description: message,
            });
        });
    };

    const handleCreateNew = () => {
        setSelectedInstructionId(null);
        setLocalTitle('Untitled Instruction');
        setLocalContent('');
        setIsCreatingNew(true);
        setEditingTitle(true);
        setEditingContent(true);
        setActiveTab('system');
    };

    const handleSave = async () => {
        const trimmedTitle = localTitle.trim() || 'Untitled Instruction';
        const trimmedContent = localContent.trim();

        if (!trimmedContent) {
            toast({
                variant: 'destructive',
                title: 'Instruction content required',
                description: 'Please add text before saving.',
            });
            return;
        }

        try {
            if (isCreatingNew) {
                const newId = await createInstruction(trimmedTitle, trimmedContent, { activate: true });
                if (newId) {
                    setSelectedInstructionId(newId);
                }
            } else if (selectedInstruction) {
                await updateInstruction(selectedInstruction.id, trimmedTitle, trimmedContent, { activate: true });
            } else if (activeInstructionId) {
                await overwriteActiveInstruction(trimmedContent);
            }
            setLocalTitle(trimmedTitle);
            setLocalContent(trimmedContent);
            setIsCreatingNew(false);
            setEditingTitle(false);
            setEditingContent(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save instruction.';
            console.error('[SettingsDialog] Failed to save instruction', error);
            toast({
                variant: 'destructive',
                title: 'Unable to save instruction',
                description: message,
            });
        }
    };

    const handleDelete = async () => {
        const target = selectedInstruction ?? activeInstruction;
        if (!target) {
            return;
        }
        if (instructions.length <= 1) {
            toast({
                variant: 'destructive',
                title: 'Cannot delete instruction',
                description: 'Keep at least one instruction available.',
            });
            return;
        }
        const confirmed = window.confirm('Delete this instruction?');
        if (!confirmed) return;

        try {
            await deleteInstruction(target.id);
            setSelectedInstructionId(null);
            setIsCreatingNew(false);
            setEditingTitle(false);
            setEditingContent(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete instruction.';
            console.error('[SettingsDialog] Failed to delete instruction', error);
            toast({
                variant: 'destructive',
                title: 'Unable to delete instruction',
                description: message,
            });
        }
    };

    const handleCancelChanges = () => {
        if (isCreatingNew) {
            resetForm();
            return;
        }
        const baseline = selectedInstruction ?? activeInstruction;
        setLocalTitle(baseline?.title ?? '');
        setLocalContent(baseline?.content ?? '');
        setEditingTitle(false);
        setEditingContent(false);
    };

    const sortedInstructions = useMemo(() => {
        const entries = instructions.map((instruction) => ({
            instruction,
            score: getInstructionUsageScore(instruction.id),
        }));
        entries.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            const aUpdated = new Date(a.instruction.updatedAt).getTime();
            const bUpdated = new Date(b.instruction.updatedAt).getTime();
            if (bUpdated !== aUpdated) {
                return bUpdated - aUpdated;
            }
            return a.instruction.title.localeCompare(b.instruction.title);
        });
        return entries.map((entry) => entry.instruction);
    }, [getInstructionUsageScore, instructions]);

    useEffect(() => {
        if (isCreatingNew) {
            return;
        }
        const baseline = selectedInstruction ?? activeInstruction;
        if (baseline) {
            setLocalTitle(baseline.title);
            setLocalContent(baseline.content);
        } else {
            setLocalTitle('');
            setLocalContent('');
        }
    }, [activeInstruction, isCreatingNew, selectedInstruction]);

    const referenceInstruction = useMemo(() => {
        if (isCreatingNew) {
            return null;
        }
        return selectedInstruction ?? activeInstruction ?? null;
    }, [activeInstruction, isCreatingNew, selectedInstruction]);

    const trimmedTitle = localTitle.trim();
    const trimmedContent = localContent.trim();
    const hasChanges = isCreatingNew
        ? trimmedTitle.length > 0 || trimmedContent.length > 0
        : referenceInstruction
            ? trimmedTitle !== referenceInstruction.title || trimmedContent !== referenceInstruction.content
            : false;
    const canSave = trimmedContent.length > 0 && hasChanges;

    const applyCustomCount = (value: number) => {
        const clamped = Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(value)));
        setCustomMessageCount(clamped);
    };

    const combinedModels = useMemo(() => {
        const map = new Map<string, ModelInfo>();
        for (const model of models) {
            if (model?.id) {
                map.set(model.id, model);
            }
        }
        if (selectedModel.id && !map.has(selectedModel.id)) {
            map.set(selectedModel.id, {
                id: selectedModel.id,
                name: selectedModel.label ?? selectedModel.id,
            });
        }
        return Array.from(map.values());
    }, [models, selectedModel]);

    const filteredModels = useMemo(() => {
        const normalizedSearch = modelSearchTerm.trim().toLowerCase();
        const entries = combinedModels.map((model) => ({
            model,
            score: getModelUsageScore(model.id),
        }));

        entries.sort((a, b) => b.score - a.score || a.model.name.localeCompare(b.model.name));

        if (!normalizedSearch) {
            return entries.map((entry) => entry.model);
        }

        return entries
            .filter((entry) =>
                entry.model.name.toLowerCase().includes(normalizedSearch) ||
                entry.model.id.toLowerCase().includes(normalizedSearch)
            )
            .map((entry) => entry.model);
    }, [combinedModels, getModelUsageScore, modelSearchTerm]);

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
                        Configure the assistant&apos;s system prompt and control how much of the conversation history is sent with each
                        request.
                    </DialogDescription>
                </DialogHeader>
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'system' | 'context' | 'model')}>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="system">Instructions</TabsTrigger>
                        <TabsTrigger value="context">Context</TabsTrigger>
                        <TabsTrigger value="model">Model</TabsTrigger>
                    </TabsList>
                    <TabsContent value="system" className="mt-6">
                        <div className="flex flex-col gap-6">
                            <section className="space-y-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-10 w-full justify-center rounded-md border-dashed"
                                    onClick={handleCreateNew}
                                    aria-label="Create instruction"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <div className="rounded-lg border">
                                    {loading ? (
                                        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                                            Loading instructions…
                                        </div>
                                    ) : instructions.length === 0 ? (
                                        <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-muted-foreground">
                                            No instructions yet. Tap the plus icon to create one.
                                        </div>
                                    ) : (
                                        <ScrollArea className="max-h-56">
                                            <div className="flex flex-col divide-y">
                                                {sortedInstructions.map((instruction) => {
                                                    const isActiveInstruction = instruction.id === activeInstructionId;
                                                    return (
                                                        <button
                                                            key={instruction.id}
                                                            type="button"
                                                            onClick={() => handleSelectInstruction(instruction.id)}
                                                            className={cn(
                                                                'flex w-full items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted',
                                                                instruction.id === (selectedInstructionId ?? activeInstructionId)
                                                                    ? 'bg-muted'
                                                                    : 'bg-background'
                                                            )}
                                                        >
                                                            <span className="truncate text-left font-medium">{instruction.title}</span>
                                                            {isActiveInstruction && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </ScrollArea>
                                    )}
                                </div>
                            </section>
                            <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold">
                                            {isCreatingNew
                                                ? 'New Instruction'
                                                : referenceInstruction?.title || 'No instruction selected'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {isCreatingNew
                                                ? 'Draft ready to configure.'
                                                : referenceInstruction
                                                    ? referenceInstruction.id === activeInstructionId
                                                        ? 'Active instruction'
                                                        : 'Tap the fields below to make changes.'
                                                    : 'Select an instruction to view and edit.'}
                                        </p>
                                    </div>
                                    {!isCreatingNew && (selectedInstruction ?? activeInstruction) && instructions.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={handleDelete}
                                            aria-label="Delete instruction"
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label
                                                htmlFor="instruction-title"
                                                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                            >
                                                Title
                                            </Label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setEditingTitle((prev) => !prev)}
                                                aria-label={editingTitle || isCreatingNew ? 'Stop editing title' : 'Edit title'}
                                                disabled={!isCreatingNew && !referenceInstruction}
                                            >
                                                <Pin
                                                    className={cn(
                                                        'h-4 w-4',
                                                        editingTitle || isCreatingNew ? 'text-primary' : 'text-muted-foreground'
                                                    )}
                                                    aria-hidden="true"
                                                />
                                            </Button>
                                        </div>
                                        <Input
                                            id="instruction-title"
                                            value={localTitle}
                                            onChange={(event) => setLocalTitle(event.target.value)}
                                            readOnly={!editingTitle && !isCreatingNew}
                                            className={cn(
                                                !editingTitle && !isCreatingNew ? 'bg-muted/50' : '',
                                                'w-full'
                                            )}
                                            placeholder="Instruction title"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label
                                                htmlFor="instruction-content"
                                                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                            >
                                                Text Content
                                            </Label>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setEditingContent((prev) => !prev)}
                                                aria-label={editingContent || isCreatingNew ? 'Stop editing content' : 'Edit content'}
                                                disabled={!isCreatingNew && !referenceInstruction}
                                            >
                                                <Pin
                                                    className={cn(
                                                        'h-4 w-4',
                                                        editingContent || isCreatingNew ? 'text-primary' : 'text-muted-foreground'
                                                    )}
                                                    aria-hidden="true"
                                                />
                                            </Button>
                                        </div>
                                        <Textarea
                                            id="instruction-content"
                                            value={localContent}
                                            onChange={(event) => setLocalContent(event.target.value)}
                                            rows={10}
                                            readOnly={!editingContent && !isCreatingNew}
                                            className={cn(
                                                'h-48 resize-none overflow-y-auto font-mono text-sm',
                                                !editingContent && !isCreatingNew ? 'bg-muted/50' : ''
                                            )}
                                            placeholder="Provide the system instruction text…"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={handleCancelChanges}
                                        disabled={!isCreatingNew && !hasChanges}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
                                        {saving ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                                Saving…
                                            </>
                                        ) : (
                                            isCreatingNew ? 'Create & Activate' : 'Save & Activate'
                                        )}
                                    </Button>
                                </div>
                            </section>
                        </div>
                    </TabsContent>
                    <TabsContent value="context" className="mt-6">
                        <div className="space-y-6">
                            <RadioGroup value={mode} onValueChange={(value) => setMode(value as ConversationContextMode)}>
                                <div
                                    className={cn(
                                        'rounded-md border p-4 transition-colors',
                                        mode === 'last-8' ? 'border-primary bg-primary/5' : 'border-muted'
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <RadioGroupItem value="last-8" id="context-last-8" />
                                        <Label htmlFor="context-last-8" className="flex-1 cursor-pointer space-y-1">
                                            <p className="text-sm font-medium">Last 8</p>
                                            <p className="text-xs text-muted-foreground">Send only the eight most recent messages with your next request.</p>
                                        </Label>
                                    </div>
                                </div>
                                <div
                                    className={cn(
                                        'rounded-md border p-4 transition-colors',
                                        mode === 'all-middle-out' ? 'border-primary bg-primary/5' : 'border-muted'
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <RadioGroupItem value="all-middle-out" id="context-all-middle" />
                                        <Label htmlFor="context-all-middle" className="flex-1 cursor-pointer space-y-1">
                                            <p className="text-sm font-medium">All (Middle Out)</p>
                                            <p className="text-xs text-muted-foreground">
                                                Send the full conversation and enable OpenRouter&apos;s middle-out compression when needed.
                                            </p>
                                        </Label>
                                    </div>
                                </div>
                                <div
                                    className={cn(
                                        'rounded-md border p-4 transition-colors',
                                        mode === 'custom' ? 'border-primary bg-primary/5' : 'border-muted'
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <RadioGroupItem value="custom" id="context-custom" />
                                        <Label htmlFor="context-custom" className="flex-1 cursor-pointer space-y-1">
                                            <p className="text-sm font-medium">Custom</p>
                                            <p className="text-xs text-muted-foreground">Choose the exact number of recent messages to include each time.</p>
                                        </Label>
                                    </div>
                                    {mode === 'custom' && (
                                        <div className="mt-4 space-y-3 rounded-md border bg-background/80 p-4">
                                            <div className="flex flex-col gap-4 md:flex-row md:items-center">
                                                <Slider
                                                    value={[customMessageCount]}
                                                    min={CUSTOM_MIN}
                                                    max={CUSTOM_MAX}
                                                    step={1}
                                                    onValueChange={(values) => applyCustomCount(values[0] ?? CUSTOM_MIN)}
                                                />
                                                <div className="flex items-center gap-2">
                                                    <Label htmlFor="custom-count" className="text-sm font-medium">
                                                        Messages
                                                    </Label>
                                                    <Input
                                                        id="custom-count"
                                                        type="number"
                                                        inputMode="numeric"
                                                        value={customMessageCount}
                                                        onChange={(event) => applyCustomCount(Number(event.target.value) || CUSTOM_MIN)}
                                                        min={CUSTOM_MIN}
                                                        max={CUSTOM_MAX}
                                                        className="w-24"
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Only the most recent {customMessageCount} message{customMessageCount === 1 ? '' : 's'} will be included in API requests.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </RadioGroup>
                        </div>
                    </TabsContent>
                    <TabsContent value="model" className="mt-6">
                        <div className="flex flex-col gap-4">
                            <Input
                                placeholder="Search models..."
                                value={modelSearchTerm}
                                onChange={(event) => setModelSearchTerm(event.target.value)}
                            />
                            <div className="h-80">
                                {modelLoading ? (
                                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                        Loading models...
                                    </div>
                                ) : modelError ? (
                                    <div className="flex h-full items-center justify-center text-center text-sm text-destructive">
                                        {modelError}
                                    </div>
                                ) : (
                                    <ScrollArea className="h-full">
                                        <div className="flex flex-col gap-3 pr-2">
                                            {filteredModels.map((model) => {
                                                const intentEnabled = getToolIntentCheck(model.id);
                                                return (
                                                    <div
                                                        key={model.id}
                                                        className={cn(
                                                            'rounded-md border p-3 transition-colors',
                                                            model.id === selectedModel.id
                                                                ? 'border-primary bg-primary/5'
                                                                : 'border-border'
                                                        )}
                                                    >
                                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedModel({ id: model.id, label: model.name })}
                                                                className="flex-1 text-left"
                                                            >
                                                                <span className="text-sm font-medium">{model.name}</span>
                                                                <span className="text-xs text-muted-foreground">{model.id}</span>
                                                            </button>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-medium text-muted-foreground">
                                                                    Tool Intent Check
                                                                </span>
                                                                <Toggle
                                                                    aria-label={`Toggle tool intent check for ${model.name}`}
                                                                    pressed={intentEnabled}
                                                                    onPressedChange={(next) => setToolIntentCheck(model.id, next)}
                                                                    className="h-8 w-20 justify-center text-xs"
                                                                >
                                                                    {intentEnabled ? 'On' : 'Off'}
                                                                </Toggle>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {filteredModels.length === 0 && (
                                                <div className="py-10 text-center text-sm text-muted-foreground">
                                                    {combinedModels.length === 0
                                                        ? 'No models available.'
                                                        : 'No models matched your search.'}
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};

export default SettingsDialog;
