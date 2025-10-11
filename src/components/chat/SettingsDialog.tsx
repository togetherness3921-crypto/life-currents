import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Check, Plus, Trash2 } from 'lucide-react';
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
        setActiveInstruction,
        updateInstruction,
        createInstruction,
        deleteInstruction,
        getUsageScore: getInstructionUsageScore,
    } = useSystemInstructions();
    const { toast } = useToast();
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
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [lastSaveError, setLastSaveError] = useState<string | null>(null);
    const titleRef = useRef<HTMLInputElement | null>(null);
    const contentRef = useRef<HTMLTextAreaElement | null>(null);
    const saveTimeoutRef = useRef<number | null>(null);
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

    const sortedInstructions = useMemo(() => {
        const ordered = [...instructions];
        ordered.sort((a, b) => {
            const usageDelta = getInstructionUsageScore(b.id) - getInstructionUsageScore(a.id);
            if (usageDelta !== 0) {
                return usageDelta;
            }
            const updatedDelta = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            if (!Number.isNaN(updatedDelta) && updatedDelta !== 0) {
                return updatedDelta;
            }
            return a.title.localeCompare(b.title);
        });
        return ordered;
    }, [getInstructionUsageScore, instructions]);

    const resolvedInstruction = useMemo(() => {
        const targetId = selectedInstructionId ?? activeInstructionId;
        if (!targetId) {
            return activeInstruction;
        }
        return instructions.find((instruction) => instruction.id === targetId) ?? activeInstruction ?? null;
    }, [activeInstruction, activeInstructionId, instructions, selectedInstructionId]);

    useEffect(() => {
        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        if (resolvedInstruction) {
            setLocalTitle(resolvedInstruction.title);
            setLocalContent(resolvedInstruction.content);
        } else {
            setLocalTitle('');
            setLocalContent('');
        }
        setSaveStatus('idle');
        setLastSaveError(null);
    }, [resolvedInstruction?.content, resolvedInstruction?.id, resolvedInstruction?.title]);

    const hasUnsavedChanges = useMemo(() => {
        if (!resolvedInstruction) {
            return localTitle.trim().length > 0 || localContent.trim().length > 0;
        }
        return localTitle !== resolvedInstruction.title || localContent !== resolvedInstruction.content;
    }, [localContent, localTitle, resolvedInstruction]);

    const persistChanges = useCallback(async () => {
        if (!resolvedInstruction || saveStatus === 'saving') {
            return;
        }
        const trimmedTitle = localTitle.trim();
        const nextTitle = trimmedTitle.length > 0 ? trimmedTitle : 'Untitled Instruction';
        const nextContent = localContent;

        if (nextTitle === resolvedInstruction.title && nextContent === resolvedInstruction.content) {
            setSaveStatus('idle');
            setLastSaveError(null);
            return;
        }

        setSaveStatus('saving');
        setLastSaveError(null);
        try {
            await updateInstruction(resolvedInstruction.id, nextTitle, nextContent);
            setSaveStatus('saved');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unexpected error while saving.';
            setLastSaveError(message);
            setSaveStatus('error');
            throw error;
        }
    }, [localContent, localTitle, resolvedInstruction, saveStatus, updateInstruction]);

    useEffect(() => {
        if (saveStatus !== 'saved') {
            return () => {
                if (saveTimeoutRef.current) {
                    window.clearTimeout(saveTimeoutRef.current);
                    saveTimeoutRef.current = null;
                }
            };
        }

        if (saveTimeoutRef.current) {
            window.clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = window.setTimeout(() => {
            setSaveStatus('idle');
            saveTimeoutRef.current = null;
        }, 2000);

        return () => {
            if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [saveStatus]);

    useEffect(() => {
        if (saveStatus === 'error') {
            setSaveStatus('idle');
            setLastSaveError(null);
        }
    }, [localContent, localTitle, saveStatus]);

    const resetInstructionForm = () => {
        setSelectedInstructionId(null);
        setLocalTitle('');
        setLocalContent('');
        setSaveStatus('idle');
        setLastSaveError(null);
    };

    const resetDialogState = () => {
        resetInstructionForm();
        setActiveTab('system');
        setModelSearchTerm('');
    };

    const handleSelectInstruction = async (id: string) => {
        const instruction = instructions.find((item) => item.id === id);
        if (!instruction) return;

        if (resolvedInstruction && resolvedInstruction.id !== id && hasUnsavedChanges) {
            try {
                await persistChanges();
            } catch {
                return;
            }
        }

        setSelectedInstructionId(id);
        setLocalTitle(instruction.title);
        setLocalContent(instruction.content);
        setSaveStatus('idle');
        setLastSaveError(null);

        if (id !== activeInstructionId) {
            try {
                await setActiveInstruction(id);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unable to activate instruction.';
                toast({
                    variant: 'destructive',
                    title: 'Failed to activate instruction',
                    description: message,
                });
            }
        }
    };

    const handleStartCreate = async () => {
        setActiveTab('system');

        if (resolvedInstruction && hasUnsavedChanges) {
            try {
                await persistChanges();
            } catch {
                return;
            }
        }

        try {
            const newId = await createInstruction('Untitled Instruction', '', { activate: true });
            if (newId) {
                setSelectedInstructionId(newId);
                setLocalTitle('Untitled Instruction');
                setLocalContent('');
                setSaveStatus('idle');
                setLastSaveError(null);
                window.setTimeout(() => {
                    if (titleRef.current) {
                        titleRef.current.focus();
                        titleRef.current.select();
                    }
                }, 0);
            }
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Failed to create instruction',
                description: error instanceof Error ? error.message : 'Unexpected error while creating.',
            });
        }
    };

    const handleDelete = async () => {
        const targetId = resolvedInstruction?.id;
        if (!targetId) {
            return;
        }

        if (instructions.length <= 1) {
            toast({
                variant: 'destructive',
                title: 'Cannot delete instruction',
                description: 'At least one instruction must remain available.',
            });
            return;
        }

        const confirmed = window.confirm('Delete this instruction? This cannot be undone.');
        if (!confirmed) return;

        try {
            await deleteInstruction(targetId);
            resetInstructionForm();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Failed to delete instruction',
                description: error instanceof Error ? error.message : 'Unexpected error while deleting.',
            });
        }
    };

    const isActiveInstruction = resolvedInstruction?.id === activeInstructionId;

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
                if (!nextOpen && hasUnsavedChanges) {
                    persistChanges().catch(() => undefined);
                }
                if (!nextOpen) {
                    resetDialogState();
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
                            <div className="flex flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={handleStartCreate}
                                    className="flex h-10 w-full items-center justify-center rounded-md border border-dashed text-sm transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    aria-label="Create instruction"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <ScrollArea className="max-h-56 rounded-md border">
                                    <div className="flex flex-col divide-y">
                                        {sortedInstructions.map((instruction) => {
                                            const isSelected = instruction.id === (selectedInstructionId ?? activeInstructionId);
                                            const isActive = instruction.id === activeInstructionId;
                                            return (
                                                <button
                                                    key={instruction.id}
                                                    type="button"
                                                    onClick={() => handleSelectInstruction(instruction.id)}
                                                    className={cn(
                                                        'flex items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/80',
                                                        isSelected ? 'bg-primary/10' : ''
                                                    )}
                                                >
                                                    <span className="truncate font-medium">
                                                        {instruction.title || 'Untitled Instruction'}
                                                    </span>
                                                    {isActive && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                                                </button>
                                            );
                                        })}
                                        {sortedInstructions.length === 0 && (
                                            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                                                No instructions saved yet.
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                            <div className="space-y-4 rounded-md border bg-card/60 p-4">
                                {loading ? (
                                    <div className="py-10 text-center text-sm text-muted-foreground">Loading instructions…</div>
                                ) : (
                                    <>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <p className="text-sm font-semibold">
                                                    {resolvedInstruction?.title || 'Select an instruction'}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {resolvedInstruction
                                                        ? isActiveInstruction
                                                            ? 'Active instruction'
                                                            : 'Inactive'
                                                        : 'Nothing selected'}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                {resolvedInstruction && saveStatus !== 'idle' && (
                                                    <div className="flex items-center gap-2 text-xs">
                                                        {saveStatus === 'saving' && (
                                                            <span className="text-muted-foreground">Saving…</span>
                                                        )}
                                                        {saveStatus === 'saved' && (
                                                            <span className="text-emerald-600">Saved</span>
                                                        )}
                                                        {saveStatus === 'error' && (
                                                            <>
                                                                <span className="text-destructive">
                                                                    {lastSaveError ?? 'Save failed'}
                                                                </span>
                                                                <Button
                                                                    type="button"
                                                                    variant="link"
                                                                    size="sm"
                                                                    className="h-auto px-0 text-xs"
                                                                    onClick={() => persistChanges().catch(() => undefined)}
                                                                >
                                                                    Retry
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={handleDelete}
                                                    disabled={!resolvedInstruction || instructions.length <= 1}
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                    <span className="sr-only">Delete instruction</span>
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="instruction-title">Title</Label>
                                                <Input
                                                    id="instruction-title"
                                                    ref={titleRef}
                                                    value={localTitle}
                                                    onChange={(event) => setLocalTitle(event.target.value)}
                                                    onBlur={() => persistChanges().catch(() => undefined)}
                                                    placeholder="Instruction title"
                                                    disabled={!resolvedInstruction}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="instruction-content">Text Content</Label>
                                                <Textarea
                                                    id="instruction-content"
                                                    ref={contentRef}
                                                    value={localContent}
                                                    onChange={(event) => setLocalContent(event.target.value)}
                                                    onBlur={() => persistChanges().catch(() => undefined)}
                                                    rows={10}
                                                    disabled={!resolvedInstruction}
                                                    className="min-h-[3.75rem] resize-y font-mono text-sm"
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
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
