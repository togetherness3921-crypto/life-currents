import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Check, Loader2, Pin, Plus, Trash2, X } from 'lucide-react';

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const CUSTOM_MIN = 1;
const CUSTOM_MAX = 200;

const INSTRUCTION_USAGE_STORAGE_KEY = 'instruction_usage_history_v1';
const INSTRUCTION_USAGE_WINDOW_MS = 72 * 60 * 60 * 1000;

interface InstructionUsageEntry {
    id: string;
    timestamp: number;
}

const readInstructionUsageHistory = (): InstructionUsageEntry[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(INSTRUCTION_USAGE_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (entry) => typeof entry?.id === 'string' && typeof entry?.timestamp === 'number',
        );
    } catch (error) {
        console.warn('[SettingsDialog] Failed to read instruction usage history', error);
        return [];
    }
};

const writeInstructionUsageHistory = (history: InstructionUsageEntry[]) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(INSTRUCTION_USAGE_STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.warn('[SettingsDialog] Failed to write instruction usage history', error);
    }
};

const pruneInstructionUsageHistory = (history: InstructionUsageEntry[]) => {
    const cutoff = Date.now() - INSTRUCTION_USAGE_WINDOW_MS;
    return history.filter((entry) => entry.timestamp >= cutoff);
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

    const [selectedInstructionId, setSelectedInstructionId] = useState<string | null>(null);
    const [draftTitle, setDraftTitle] = useState('');
    const [draftContent, setDraftContent] = useState('');
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [activationPendingId, setActivationPendingId] = useState<string | null>(null);
    const [instructionUsageHistory, setInstructionUsageHistory] = useState<InstructionUsageEntry[]>(() =>
        pruneInstructionUsageHistory(readInstructionUsageHistory())
    );
    const [activeTab, setActiveTab] = useState<'system' | 'context' | 'model'>('system');
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [modelSearchTerm, setModelSearchTerm] = useState('');
    const [modelLoading, setModelLoading] = useState(false);
    const [modelError, setModelError] = useState<string | null>(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);

    useEffect(() => {
        writeInstructionUsageHistory(instructionUsageHistory);
    }, [instructionUsageHistory]);

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
        if (!targetId) {
            return activeInstruction;
        }
        return instructions.find((instruction) => instruction.id === targetId) ?? activeInstruction;
    }, [activeInstruction, activeInstructionId, instructions, isCreatingNew, selectedInstructionId]);

    const sortedInstructions = useMemo(() => {
        const counts = new Map<string, number>();
        for (const entry of instructionUsageHistory) {
            counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
        }

        return [...instructions].sort((a, b) => {
            const scoreA = (counts.get(a.id) ?? 0) + (a.id === activeInstructionId ? 0.5 : 0);
            const scoreB = (counts.get(b.id) ?? 0) + (b.id === activeInstructionId ? 0.5 : 0);
            if (scoreA !== scoreB) {
                return scoreB - scoreA;
            }
            return a.title.localeCompare(b.title);
        });
    }, [activeInstructionId, instructionUsageHistory, instructions]);

    useEffect(() => {
        if (isCreatingNew) {
            setDraftTitle('');
            setDraftContent('');
            setIsEditingTitle(true);
            setIsEditingContent(true);
            return;
        }

        if (selectedInstruction) {
            setDraftTitle(selectedInstruction.title);
            setDraftContent(selectedInstruction.content);
        } else if (activeInstruction) {
            setDraftTitle(activeInstruction.title);
            setDraftContent(activeInstruction.content);
        } else {
            setDraftTitle('');
            setDraftContent('');
        }
        setIsEditingTitle(false);
        setIsEditingContent(false);
    }, [activeInstruction, isCreatingNew, selectedInstruction]);

    const resetForm = useCallback(() => {
        setSelectedInstructionId(null);
        setDraftTitle('');
        setDraftContent('');
        setIsCreatingNew(false);
        setIsEditingTitle(false);
        setIsEditingContent(false);
        setActivationPendingId(null);
        setActiveTab('system');
        setModelSearchTerm('');
    }, [setActiveTab, setModelSearchTerm]);

    const recordInstructionUsage = useCallback((id: string) => {
        setInstructionUsageHistory((prev) =>
            pruneInstructionUsageHistory([...prev, { id, timestamp: Date.now() }]),
        );
    }, [setInstructionUsageHistory]);

    const handleSelectInstruction = useCallback(async (id: string) => {
        const instruction = instructions.find((item) => item.id === id);
        setSelectedInstructionId(id);
        setIsCreatingNew(false);
        setIsEditingTitle(false);
        setIsEditingContent(false);
        if (instruction) {
            setDraftTitle(instruction.title);
            setDraftContent(instruction.content);
        }
        try {
            setActivationPendingId(id);
            await setActiveInstruction(id);
            recordInstructionUsage(id);
        } catch (error) {
            console.error('[SettingsDialog] Failed to activate instruction', error);
        } finally {
            setActivationPendingId(null);
        }
    }, [instructions, recordInstructionUsage, setActiveInstruction]);

    const handleCreateNew = useCallback(() => {
        setSelectedInstructionId(null);
        setIsCreatingNew(true);
        setDraftTitle('');
        setDraftContent('');
        setIsEditingTitle(true);
        setIsEditingContent(true);
        setActivationPendingId(null);
    }, []);

    const cancelTitleEdit = useCallback(() => {
        if (isCreatingNew) {
            setDraftTitle('');
        } else if (selectedInstruction) {
            setDraftTitle(selectedInstruction.title);
        } else if (activeInstruction) {
            setDraftTitle(activeInstruction.title);
        } else {
            setDraftTitle('');
        }
        setIsEditingTitle(false);
    }, [activeInstruction, isCreatingNew, selectedInstruction]);

    const cancelContentEdit = useCallback(() => {
        if (isCreatingNew) {
            setDraftContent('');
        } else if (selectedInstruction) {
            setDraftContent(selectedInstruction.content);
        } else if (activeInstruction) {
            setDraftContent(activeInstruction.content);
        } else {
            setDraftContent('');
        }
        setIsEditingContent(false);
    }, [activeInstruction, isCreatingNew, selectedInstruction]);

    const handleSave = useCallback(async () => {
        try {
            if (isCreatingNew) {
                const newId = await createInstruction(draftTitle.trim() || 'Untitled Instruction', draftContent, {
                    activate: true,
                });
                if (newId) {
                    setSelectedInstructionId(newId);
                    setIsCreatingNew(false);
                    recordInstructionUsage(newId);
                }
            } else if (selectedInstruction) {
                await updateInstruction(
                    selectedInstruction.id,
                    draftTitle.trim() || selectedInstruction.title,
                    draftContent,
                    { activate: true },
                );
                recordInstructionUsage(selectedInstruction.id);
            } else if (activeInstructionId) {
                await overwriteActiveInstruction(draftContent);
                recordInstructionUsage(activeInstructionId);
            }
            setIsEditingTitle(false);
            setIsEditingContent(false);
        } catch (error) {
            console.error('[SettingsDialog] Failed to save instruction', error);
        }
    }, [activeInstructionId, createInstruction, draftContent, draftTitle, isCreatingNew, overwriteActiveInstruction, recordInstructionUsage, selectedInstruction, updateInstruction]);

    const handleDelete = useCallback(async () => {
        const targetId = selectedInstruction?.id ?? activeInstructionId;
        if (!targetId) return;
        if (instructions.length <= 1) return;
        try {
            await deleteInstruction(targetId);
            if (targetId === selectedInstructionId) {
                setSelectedInstructionId(null);
            }
            setInstructionUsageHistory((prev) =>
                pruneInstructionUsageHistory(prev.filter((entry) => entry.id !== targetId)),
            );
            resetForm();
        } catch (error) {
            console.error('[SettingsDialog] Failed to delete instruction', error);
        }
    }, [activeInstructionId, deleteInstruction, instructions.length, resetForm, selectedInstruction, selectedInstructionId]);

    const isActiveInstruction = !isCreatingNew && (selectedInstruction?.id ?? activeInstructionId) === activeInstructionId;

    const canSave = draftContent.trim().length > 0;

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
                            <div className="space-y-3 rounded-lg border bg-card p-4">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-full justify-center rounded-md border border-dashed"
                                    onClick={handleCreateNew}
                                    aria-label="Create instruction"
                                >
                                    <Plus className="h-5 w-5" />
                                </Button>
                                {loading ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading instructions…
                                    </div>
                                ) : (
                                    <ScrollArea className="max-h-64">
                                        <div className="flex flex-col gap-2 py-1">
                                            {sortedInstructions.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">No instructions saved yet.</p>
                                            ) : (
                                                sortedInstructions.map((instruction) => {
                                                    const isSelected = !isCreatingNew && instruction.id === (selectedInstructionId ?? activeInstructionId);
                                                    const isActive = instruction.id === activeInstructionId;
                                                    const isPending = activationPendingId === instruction.id;
                                                    return (
                                                        <button
                                                            key={instruction.id}
                                                            type="button"
                                                            onClick={() => handleSelectInstruction(instruction.id)}
                                                            disabled={saving || isPending}
                                                            className={cn(
                                                                'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60',
                                                                isSelected ? 'border-primary bg-primary/5' : 'border-transparent'
                                                            )}
                                                        >
                                                            <span className="truncate">{instruction.title || 'Untitled Instruction'}</span>
                                                            <span className="flex items-center gap-1">
                                                                {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                                                {!isPending && isActive && <Check className="h-4 w-4 text-primary" />}
                                                            </span>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </ScrollArea>
                                )}
                            </div>
                            <div className="space-y-4 rounded-lg border bg-card p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">
                                            {isCreatingNew ? 'New Instruction' : selectedInstruction?.title || activeInstruction?.title || 'Instruction Details'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {isActiveInstruction ? 'Active instruction' : 'Inactive'}
                                        </p>
                                    </div>
                                    {!isCreatingNew && instructions.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={handleDelete}
                                            disabled={saving || loading}
                                            aria-label="Delete instruction"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-medium uppercase text-muted-foreground">Title</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={draftTitle}
                                                onChange={(event) => setDraftTitle(event.target.value)}
                                                placeholder="Instruction title"
                                                readOnly={!isEditingTitle}
                                            />
                                            {!isEditingTitle ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setIsEditingTitle(true)}
                                                    aria-label="Edit title"
                                                >
                                                    <Pin className="h-4 w-4" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={cancelTitleEdit}
                                                    aria-label="Stop editing title"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-medium uppercase text-muted-foreground">Text Content</Label>
                                        <div className="flex items-start gap-2">
                                            <Textarea
                                                value={draftContent}
                                                onChange={(event) => setDraftContent(event.target.value)}
                                                rows={10}
                                                readOnly={!isEditingContent}
                                                className="h-48 resize-none overflow-y-auto font-mono text-sm"
                                            />
                                            {!isEditingContent ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="mt-1"
                                                    onClick={() => setIsEditingContent(true)}
                                                    aria-label="Edit content"
                                                >
                                                    <Pin className="h-4 w-4" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="mt-1"
                                                    onClick={cancelContentEdit}
                                                    aria-label="Stop editing content"
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-xs text-muted-foreground">
                                        {isCreatingNew
                                            ? 'Create a new instruction to activate it immediately.'
                                            : isActiveInstruction
                                                ? 'This instruction is currently active.'
                                                : 'Select an instruction above to activate it.'}
                                    </p>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={resetForm}
                                            disabled={saving}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={handleSave}
                                            disabled={!canSave || saving}
                                        >
                                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            {isCreatingNew ? 'Create & Activate' : 'Save & Activate'}
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
