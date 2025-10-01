import React, { useEffect, useMemo, useState } from 'react';
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
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import { useConversationContext } from '@/hooks/useConversationContext';
import type { ConversationContextMode } from '@/hooks/conversationContextProviderContext';
import useModelSelection from '@/hooks/useModelSelection';
import { SEED_MODELS } from '@/hooks/modelSelectionProvider';
import { getAvailableModels, type ModelInfo } from '@/services/openRouter';

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
        ensureToolIntentSetting,
        getToolIntentEnabled,
        setToolIntentEnabled,
    } = useModelSelection();

    const [selectedInstructionId, setSelectedInstructionId] = useState<string | null>(null);
    const [localTitle, setLocalTitle] = useState('');
    const [localContent, setLocalContent] = useState('');
    const [isEditingExisting, setIsEditingExisting] = useState(false);
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [activeTab, setActiveTab] = useState<'system' | 'context' | 'model'>('system');
    const [modelSearchTerm, setModelSearchTerm] = useState('');
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [hasLoadedModels, setHasLoadedModels] = useState(false);
    const [modelReloadToken, setModelReloadToken] = useState(0);

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
        setModelSearchTerm('');
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
        setActiveTab('system');
    };

    const handleEdit = () => {
        if (!selectedInstruction) return;
        setLocalTitle(selectedInstruction.title);
        setLocalContent(selectedInstruction.content);
        setIsEditingExisting(true);
        setActiveTab('system');
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

    const applyCustomCount = (value: number) => {
        const clamped = Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(value)));
        setCustomMessageCount(clamped);
    };

    useEffect(() => {
        ensureToolIntentSetting(selectedModel.id);
    }, [selectedModel.id, ensureToolIntentSetting]);

    useEffect(() => {
        if (!open || activeTab !== 'model' || hasLoadedModels) return;
        let isMounted = true;
        setModelsLoading(true);
        setModelsError(null);

        getAvailableModels()
            .then((fetched) => {
                if (!isMounted) return;
                setModels(fetched);
                fetched.forEach((model) => ensureToolIntentSetting(model.id));
                setHasLoadedModels(true);
            })
            .catch((error) => {
                if (!isMounted) return;
                setModelsError(error instanceof Error ? error.message : 'Failed to load models');
            })
            .finally(() => {
                if (!isMounted) return;
                setModelsLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [open, activeTab, hasLoadedModels, ensureToolIntentSetting, modelReloadToken]);

    const filteredModels = useMemo(() => {
        const dataset = new Map<string, ModelInfo>();
        models.forEach((model) => {
            dataset.set(model.id, model);
        });
        SEED_MODELS.forEach((seed) => {
            if (!dataset.has(seed.id)) {
                dataset.set(seed.id, { id: seed.id, name: seed.label ?? seed.id });
            }
        });
        if (!dataset.has(selectedModel.id)) {
            dataset.set(selectedModel.id, { id: selectedModel.id, name: selectedModel.label ?? selectedModel.id });
        }

        const normalizedSearch = modelSearchTerm.trim().toLowerCase();
        const ranked = Array.from(dataset.values())
            .map((model) => ({
                model,
                score: getUsageScore(model.id),
            }))
            .sort((a, b) => {
                const labelA = a.model.name ?? a.model.id;
                const labelB = b.model.name ?? b.model.id;
                return b.score - a.score || labelA.localeCompare(labelB);
            });

        if (!normalizedSearch) {
            return ranked.map((entry) => entry.model);
        }

        return ranked
            .filter((entry) => {
                const name = entry.model.name ?? entry.model.id;
                return (
                    name.toLowerCase().includes(normalizedSearch) ||
                    entry.model.id.toLowerCase().includes(normalizedSearch)
                );
            })
            .map((entry) => entry.model);
    }, [models, modelSearchTerm, getUsageScore, selectedModel.id, selectedModel.label]);

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
                        <TabsTrigger value="system">System Instructions</TabsTrigger>
                        <TabsTrigger value="context">Context</TabsTrigger>
                        <TabsTrigger value="model">Model</TabsTrigger>
                    </TabsList>
                    <TabsContent value="system" className="mt-6">
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
                                        rows={10}
                                        disabled={!isEditingExisting}
                                        className="h-48 resize-none overflow-y-auto font-mono text-sm"
                                    />
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
                            <div className="h-96 overflow-hidden rounded-lg border bg-card">
                                {modelsLoading ? (
                                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                        Loading models...
                                    </div>
                                ) : modelsError ? (
                                    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                                        <p className="text-sm text-destructive">{modelsError}</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setHasLoadedModels(false);
                                                setModels([]);
                                                setModelsError(null);
                                                setModelReloadToken((token) => token + 1);
                                            }}
                                        >
                                            Try Again
                                        </Button>
                                    </div>
                                ) : (
                                    <ScrollArea className="h-full">
                                        <div className="flex flex-col gap-2 p-2 pr-4">
                                            {filteredModels.map((model) => {
                                                const isSelected = model.id === selectedModel.id;
                                                const toolIntentEnabled = getToolIntentEnabled(model.id);
                                                return (
                                                    <div
                                                        key={model.id}
                                                        className={cn(
                                                            'flex items-center gap-3 rounded-md border bg-background/90 p-3 transition-colors',
                                                            isSelected ? 'border-primary bg-primary/5' : 'border-border'
                                                        )}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setSelectedModel({ id: model.id, label: model.name ?? model.id })
                                                            }
                                                            className="flex flex-1 flex-col text-left"
                                                        >
                                                            <span className="text-sm font-medium">{model.name ?? model.id}</span>
                                                            <span className="text-xs text-muted-foreground">{model.id}</span>
                                                        </button>
                                                        <div className="flex items-center gap-2 pl-2">
                                                            <span className="text-xs font-medium text-muted-foreground">
                                                                Tool Intent Check
                                                            </span>
                                                            <Toggle
                                                                pressed={toolIntentEnabled}
                                                                onPressedChange={(pressed) =>
                                                                    setToolIntentEnabled(model.id, pressed)
                                                                }
                                                                aria-label={`Toggle tool intent check for ${model.name ?? model.id}`}
                                                                className="h-9 w-16 rounded-full border bg-muted text-xs font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                                                            >
                                                                {toolIntentEnabled ? 'On' : 'Off'}
                                                            </Toggle>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {filteredModels.length === 0 && (
                                                <div className="py-12 text-center text-sm text-muted-foreground">
                                                    No models matched your search.
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
