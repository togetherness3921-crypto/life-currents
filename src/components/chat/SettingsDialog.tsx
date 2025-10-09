import React, { useEffect, useMemo, useState } from 'react';
import { Check, Pin, Plus, Trash2, X } from 'lucide-react';
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
        getUsageScore,
        setActiveInstruction,
        updateInstruction,
        createInstruction,
        deleteInstruction,
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
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [activeTab, setActiveTab] = useState<'system' | 'context' | 'model'>('system');
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [modelSearchTerm, setModelSearchTerm] = useState('');
    const [modelLoading, setModelLoading] = useState(false);
    const [modelError, setModelError] = useState<string | null>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);

    const resetForm = () => {
        setSelectedInstructionId(null);
        setLocalTitle('');
        setLocalContent('');
        setIsCreatingNew(false);
        setIsEditingTitle(false);
        setIsEditingContent(false);
        setActiveTab('system');
        setModelSearchTerm('');
    };

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

    const sortedInstructions = useMemo(() => {
        const items = [...instructions];
        items.sort((a, b) => {
            const scoreDifference = getUsageScore(b.id) - getUsageScore(a.id);
            if (scoreDifference !== 0) {
                return scoreDifference;
            }
            const updatedA = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const updatedB = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return updatedB - updatedA;
        });
        return items;
    }, [getUsageScore, instructions]);

    const selectedInstruction = isCreatingNew
        ? null
        : instructions.find((instruction) => instruction.id === selectedInstructionId) ?? null;

    const effectiveInstruction = isCreatingNew
        ? null
        : selectedInstruction ?? activeInstruction ?? null;

    useEffect(() => {
        if (isCreatingNew) {
            return;
        }

        if (instructions.length === 0) {
            setSelectedInstructionId(null);
            setLocalTitle('');
            setLocalContent('');
            return;
        }

        if (!selectedInstructionId) {
            const candidateId =
                (activeInstructionId && instructions.some((item) => item.id === activeInstructionId))
                    ? activeInstructionId
                    : instructions[0].id;
            const candidate = instructions.find((item) => item.id === candidateId) ?? instructions[0];
            setSelectedInstructionId(candidate.id);
            setLocalTitle(candidate.title);
            setLocalContent(candidate.content);
            return;
        }

        const exists = instructions.some((instruction) => instruction.id === selectedInstructionId);
        if (!exists) {
            const fallbackId =
                (activeInstructionId && instructions.some((item) => item.id === activeInstructionId))
                    ? activeInstructionId
                    : instructions[0].id;
            const fallback = instructions.find((item) => item.id === fallbackId) ?? instructions[0];
            setSelectedInstructionId(fallback.id);
            setLocalTitle(fallback.title);
            setLocalContent(fallback.content);
        }
    }, [activeInstructionId, instructions, isCreatingNew, selectedInstructionId]);

    const handleSelectInstruction = async (id: string) => {
        const instruction = instructions.find((item) => item.id === id);
        setIsCreatingNew(false);
        setIsEditingTitle(false);
        setIsEditingContent(false);
        setSelectedInstructionId(id);
        if (instruction) {
            setLocalTitle(instruction.title);
            setLocalContent(instruction.content);
        }
        try {
            await setActiveInstruction(id);
        } catch (error) {
            console.error('[SettingsDialog] Failed to activate instruction', error);
        }
    };

    const handleCreateNew = () => {
        setSelectedInstructionId(null);
        setIsCreatingNew(true);
        setIsEditingTitle(true);
        setIsEditingContent(true);
        setLocalTitle('Untitled Instruction');
        setLocalContent(activeInstruction?.content ?? '');
    };

    const handleCancelChanges = () => {
        if (isCreatingNew) {
            setIsCreatingNew(false);
            setIsEditingTitle(false);
            setIsEditingContent(false);
            if (instructions.length === 0) {
                setLocalTitle('');
                setLocalContent('');
                return;
            }
            const fallbackId =
                (selectedInstructionId && instructions.some((item) => item.id === selectedInstructionId))
                    ? selectedInstructionId
                    : (activeInstructionId && instructions.some((item) => item.id === activeInstructionId))
                        ? activeInstructionId
                        : instructions[0].id;
            const fallback = instructions.find((item) => item.id === fallbackId) ?? instructions[0];
            setSelectedInstructionId(fallback.id);
            setLocalTitle(fallback.title);
            setLocalContent(fallback.content);
            return;
        }

        setIsEditingTitle(false);
        setIsEditingContent(false);
        if (effectiveInstruction) {
            setLocalTitle(effectiveInstruction.title);
            setLocalContent(effectiveInstruction.content);
        }
    };

    const handleSave = async () => {
        try {
            if (isCreatingNew) {
                const newId = await createInstruction(localTitle, localContent, { activate: true });
                if (newId) {
                    setSelectedInstructionId(newId);
                }
                setIsCreatingNew(false);
            } else if (effectiveInstruction) {
                await updateInstruction(effectiveInstruction.id, localTitle, localContent, { activate: true });
            }
            setIsEditingTitle(false);
            setIsEditingContent(false);
        } catch (error) {
            console.error('[SettingsDialog] Failed to save instruction', error);
        }
    };

    const handleDelete = async () => {
        if (isCreatingNew) {
            handleCancelChanges();
            return;
        }
        const targetId = effectiveInstruction?.id;
        if (!targetId) return;
        if (instructions.length <= 1) return;
        try {
            await deleteInstruction(targetId);
        } catch (error) {
            console.error('[SettingsDialog] Failed to delete instruction', error);
            return;
        }
        setSelectedInstructionId((current) => (current === targetId ? null : current));
        setIsEditingTitle(false);
        setIsEditingContent(false);
        setIsCreatingNew(false);
    };

    const isActiveInstruction = !isCreatingNew && effectiveInstruction?.id === activeInstructionId;
    const originalTitle = isCreatingNew ? '' : effectiveInstruction?.title ?? '';
    const originalContent = isCreatingNew ? '' : effectiveInstruction?.content ?? '';
    const hasUnsavedChanges = isCreatingNew
        ? localTitle.trim().length > 0 || localContent.trim().length > 0
        : localTitle !== originalTitle || localContent !== originalContent;
    const canSave = localContent.trim().length > 0 && hasUnsavedChanges;
    const instructionStatus = isCreatingNew
        ? 'New instruction'
        : isActiveInstruction
            ? 'Active instruction'
            : 'Inactive';

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
                                    className="h-10 w-full justify-center"
                                    onClick={handleCreateNew}
                                    disabled={saving}
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    <span className="sr-only">Create new instruction</span>
                                </Button>
                                {sortedInstructions.length > 0 ? (
                                    <ScrollArea className="max-h-64 rounded-md border bg-background">
                                        <div className="flex flex-col gap-2 p-2 pr-3">
                                            {sortedInstructions.map((instruction) => {
                                                const isSelected = !isCreatingNew && instruction.id === selectedInstructionId;
                                                const isActive = instruction.id === activeInstructionId;
                                                return (
                                                    <button
                                                        key={instruction.id}
                                                        type="button"
                                                        onClick={() => void handleSelectInstruction(instruction.id)}
                                                        className={cn(
                                                            'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                                                            isSelected
                                                                ? 'border-primary bg-primary/5 text-primary'
                                                                : 'border-transparent hover:border-primary/30 hover:bg-muted/60'
                                                        )}
                                                    >
                                                        <span className="truncate">{instruction.title}</span>
                                                        {isActive && (
                                                            <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </ScrollArea>
                                ) : (
                                    <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                                        {loading ? 'Loading instructions…' : 'No instructions saved yet.'}
                                    </div>
                                )}
                            </section>
                            <section className="space-y-4 rounded-md border bg-card p-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-foreground">
                                            {isCreatingNew
                                                ? 'New Instruction'
                                                : effectiveInstruction?.title ?? 'No instruction selected'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{instructionStatus}</p>
                                    </div>
                                    {!isCreatingNew && (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            onClick={handleDelete}
                                            disabled={instructions.length <= 1 || saving}
                                            aria-label="Delete instruction"
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="instruction-title" className="text-xs font-semibold uppercase text-muted-foreground">
                                            Title
                                        </Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                id="instruction-title"
                                                value={localTitle}
                                                onChange={(event) => setLocalTitle(event.target.value)}
                                                placeholder="Instruction title"
                                                disabled={!isCreatingNew && !isEditingTitle}
                                            />
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => setIsEditingTitle(true)}
                                                disabled={isCreatingNew || isEditingTitle}
                                                aria-label="Edit title"
                                            >
                                                <Pin className="h-4 w-4" aria-hidden="true" />
                                            </Button>
                                            {isEditingTitle && !isCreatingNew && (
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setIsEditingTitle(false);
                                                        if (effectiveInstruction) {
                                                            setLocalTitle(effectiveInstruction.title);
                                                        }
                                                    }}
                                                    aria-label="Cancel title edits"
                                                >
                                                    <X className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="instruction-content" className="text-xs font-semibold uppercase text-muted-foreground">
                                            Text Content
                                        </Label>
                                        <div className="flex items-start gap-2">
                                            <Textarea
                                                id="instruction-content"
                                                value={localContent}
                                                onChange={(event) => setLocalContent(event.target.value)}
                                                rows={10}
                                                disabled={!isCreatingNew && !isEditingContent}
                                                className="h-48 resize-none font-mono text-sm"
                                            />
                                            <div className="flex flex-col gap-2">
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => setIsEditingContent(true)}
                                                    disabled={isCreatingNew || isEditingContent}
                                                    aria-label="Edit content"
                                                >
                                                    <Pin className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                                {isEditingContent && !isCreatingNew && (
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        onClick={() => {
                                                            setIsEditingContent(false);
                                                            if (effectiveInstruction) {
                                                                setLocalContent(effectiveInstruction.content);
                                                            }
                                                        }}
                                                        aria-label="Cancel content edits"
                                                    >
                                                        <X className="h-4 w-4" aria-hidden="true" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs text-muted-foreground">
                                        {saving ? 'Saving…' : hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={handleCancelChanges}
                                            disabled={saving || (!hasUnsavedChanges && !isCreatingNew)}
                                        >
                                            Cancel
                                        </Button>
                                        <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
                                            {saving ? 'Saving…' : 'Save & Activate'}
                                        </Button>
                                    </div>
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
