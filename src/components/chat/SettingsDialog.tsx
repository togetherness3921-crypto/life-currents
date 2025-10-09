import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Pin, Plus, Trash2 } from 'lucide-react';
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
        setActiveInstruction,
        updateInstruction,
        createInstruction,
        deleteInstruction,
        recordInstructionUsage,
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
        getUsageScore,
        getToolIntentCheck,
        setToolIntentCheck,
    } = useModelSelection();

    const NEW_INSTRUCTION_ID = '__new_instruction__';
    const [selectedInstructionId, setSelectedInstructionId] = useState<string | typeof NEW_INSTRUCTION_ID | null>(null);
    const [draftTitle, setDraftTitle] = useState('');
    const [draftContent, setDraftContent] = useState('');
    const [isTitleEditable, setIsTitleEditable] = useState(false);
    const [isContentEditable, setIsContentEditable] = useState(false);
    const [activeTab, setActiveTab] = useState<'system' | 'context' | 'model'>('system');
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [modelSearchTerm, setModelSearchTerm] = useState('');
    const [modelLoading, setModelLoading] = useState(false);
    const [modelError, setModelError] = useState<string | null>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);

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

    const isCreatingNew = selectedInstructionId === NEW_INSTRUCTION_ID;
    const resolvedInstructionId = isCreatingNew ? null : (selectedInstructionId ?? activeInstructionId ?? null);

    const sortedInstructions = useMemo(() => {
        const entries = instructions.map((instruction) => ({
            instruction,
            score: getInstructionUsageScore(instruction.id),
        }));

        entries.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            const aUpdated = a.instruction.updatedAt ? Date.parse(a.instruction.updatedAt) : 0;
            const bUpdated = b.instruction.updatedAt ? Date.parse(b.instruction.updatedAt) : 0;
            return bUpdated - aUpdated;
        });

        return entries.map((entry) => entry.instruction);
    }, [getInstructionUsageScore, instructions]);

    const resolvedInstruction = useMemo(() => {
        if (resolvedInstructionId) {
            return instructions.find((instruction) => instruction.id === resolvedInstructionId) ?? activeInstruction ?? null;
        }
        return activeInstruction ?? null;
    }, [activeInstruction, instructions, resolvedInstructionId]);

    const baselineTitle = isCreatingNew ? '' : resolvedInstruction?.title ?? '';
    const baselineContent = isCreatingNew ? '' : resolvedInstruction?.content ?? '';

    const hasChanges = isCreatingNew
        ? draftTitle.trim().length > 0 || draftContent.trim().length > 0
        : draftTitle !== baselineTitle || draftContent !== baselineContent;

    const canSave = draftContent.trim().length > 0 && (isCreatingNew || hasChanges);

    const titleEditable = isTitleEditable;
    const contentEditable = isContentEditable;

    const resetForm = useCallback(() => {
        setSelectedInstructionId(activeInstructionId ?? null);
        setDraftTitle(activeInstruction?.title ?? '');
        setDraftContent(activeInstruction?.content ?? '');
        setIsTitleEditable(false);
        setIsContentEditable(false);
        setActiveTab('system');
        setModelSearchTerm('');
    }, [activeInstruction, activeInstructionId]);

    const handleSelectInstruction = useCallback(async (id: string) => {
        const instruction = instructions.find((item) => item.id === id) ?? null;
        setSelectedInstructionId(id);
        setIsTitleEditable(false);
        setIsContentEditable(false);
        if (instruction) {
            setDraftTitle(instruction.title);
            setDraftContent(instruction.content);
        }
        try {
            await setActiveInstruction(id);
            recordInstructionUsage(id);
        } catch (error) {
            console.error('[SettingsDialog] Failed to activate instruction', error);
        }
    }, [instructions, recordInstructionUsage, setActiveInstruction]);

    const handleCreateNew = useCallback(() => {
        setSelectedInstructionId(NEW_INSTRUCTION_ID);
        setDraftTitle('Untitled Instruction');
        setDraftContent(activeInstruction?.content ?? '');
        setIsTitleEditable(true);
        setIsContentEditable(true);
        setActiveTab('system');
    }, [activeInstruction]);

    const handleCancelEdit = useCallback(() => {
        if (isCreatingNew) {
            resetForm();
            return;
        }
        setDraftTitle(baselineTitle);
        setDraftContent(baselineContent);
        setIsTitleEditable(false);
        setIsContentEditable(false);
    }, [baselineContent, baselineTitle, isCreatingNew, resetForm]);

    const handleSave = useCallback(async () => {
        if (!canSave) return;

        if (isCreatingNew) {
            const newId = await createInstruction(draftTitle.trim() || 'Untitled Instruction', draftContent, { activate: true });
            if (newId) {
                setSelectedInstructionId(newId);
                setIsTitleEditable(false);
                setIsContentEditable(false);
                recordInstructionUsage(newId);
            }
            return;
        }

        const targetId = resolvedInstruction?.id ?? activeInstructionId;
        if (!targetId) return;
        await updateInstruction(targetId, draftTitle, draftContent, { activate: true });
        setSelectedInstructionId(targetId);
        setIsTitleEditable(false);
        setIsContentEditable(false);
        recordInstructionUsage(targetId);
    }, [
        activeInstructionId,
        canSave,
        createInstruction,
        draftContent,
        draftTitle,
        isCreatingNew,
        recordInstructionUsage,
        resolvedInstruction,
        updateInstruction,
    ]);

    const handleDelete = useCallback(async () => {
        if (isCreatingNew) {
            resetForm();
            return;
        }
        const targetId = resolvedInstruction?.id;
        if (!targetId) return;
        if (instructions.length <= 1) return;
        await deleteInstruction(targetId);
        resetForm();
    }, [deleteInstruction, instructions.length, isCreatingNew, resetForm, resolvedInstruction]);

    useEffect(() => {
        if (!open) return;
        if (selectedInstructionId && selectedInstructionId !== NEW_INSTRUCTION_ID) return;
        if (!activeInstructionId) return;
        const instruction = instructions.find((item) => item.id === activeInstructionId) ?? activeInstruction;
        if (!instruction) return;
        setSelectedInstructionId(activeInstructionId);
        setDraftTitle(instruction.title);
        setDraftContent(instruction.content);
    }, [activeInstruction, activeInstructionId, instructions, open, selectedInstructionId]);

    useEffect(() => {
        if (!open) return;
        if (isCreatingNew) return;
        if (isTitleEditable || isContentEditable) return;
        if (!resolvedInstruction) return;
        setDraftTitle(resolvedInstruction.title ?? '');
        setDraftContent(resolvedInstruction.content ?? '');
    }, [isContentEditable, isCreatingNew, isTitleEditable, open, resolvedInstruction]);

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
            score: getUsageScore(model.id),
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
    }, [combinedModels, getUsageScore, modelSearchTerm]);

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
                            <div className="rounded-lg border bg-card shadow-sm">
                                <button
                                    type="button"
                                    onClick={handleCreateNew}
                                    className="flex w-full items-center justify-center border-b px-3 py-2 text-muted-foreground transition hover:bg-muted"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    <span className="sr-only">Create new instruction</span>
                                </button>
                                <ScrollArea className="max-h-64">
                                    <div className="flex flex-col divide-y">
                                        {sortedInstructions.map((instruction) => {
                                            const isActiveInstruction = instruction.id === activeInstructionId;
                                            const isSelectedInstruction = !isCreatingNew && ((resolvedInstructionId ?? activeInstructionId) === instruction.id);
                                            return (
                                                <button
                                                    key={instruction.id}
                                                    type="button"
                                                    onClick={() => handleSelectInstruction(instruction.id)}
                                                    className={cn(
                                                        'flex items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-muted',
                                                        isSelectedInstruction ? 'bg-primary/5' : 'bg-transparent'
                                                    )}
                                                >
                                                    <span className={cn('truncate font-medium', isSelectedInstruction ? 'text-foreground' : '')}>
                                                        {instruction.title}
                                                    </span>
                                                    {isActiveInstruction && (
                                                        <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                        {sortedInstructions.length === 0 && (
                                            <div className="px-3 py-4 text-sm text-muted-foreground">
                                                No saved instructions yet.
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                            <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold">
                                            {isCreatingNew ? 'New Instruction' : resolvedInstruction?.title ?? 'No instruction selected'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {isCreatingNew
                                                ? 'Draft will become active when saved.'
                                                : resolvedInstruction?.id === activeInstructionId
                                                    ? 'Active instruction'
                                                    : 'Tap an instruction above to activate it.'}
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Title</p>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => setIsTitleEditable((prev) => !prev)}
                                                aria-label={titleEditable ? 'Stop editing title' : 'Edit title'}
                                            >
                                                <Pin className={cn('h-4 w-4', titleEditable ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                                            </Button>
                                        </div>
                                        <Input
                                            value={draftTitle}
                                            onChange={(event) => setDraftTitle(event.target.value)}
                                            placeholder="Instruction title"
                                            readOnly={!titleEditable}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Text Content</p>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => setIsContentEditable((prev) => !prev)}
                                                aria-label={contentEditable ? 'Stop editing content' : 'Edit content'}
                                            >
                                                <Pin className={cn('h-4 w-4', contentEditable ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                                            </Button>
                                        </div>
                                        <Textarea
                                            value={draftContent}
                                            onChange={(event) => setDraftContent(event.target.value)}
                                            rows={10}
                                            readOnly={!contentEditable}
                                            className="h-48 resize-none overflow-y-auto font-mono text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        {!isCreatingNew && instructions.length > 1 && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="destructive"
                                                onClick={handleDelete}
                                                disabled={saving || loading}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                                Delete
                                            </Button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {(isCreatingNew || isTitleEditable || isContentEditable) && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={handleCancelEdit}
                                                disabled={saving}
                                            >
                                                Cancel
                                            </Button>
                                        )}
                                        <Button type="button" size="sm" onClick={handleSave} disabled={!canSave || saving}>
                                            {saving ? 'Saving…' : 'Save'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
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
