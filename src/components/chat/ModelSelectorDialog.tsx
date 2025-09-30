import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchAvailableModels, type OpenRouterModel } from '@/services/openRouter';
import useModelPreference from '@/hooks/useModelPreference';

interface ModelSelectorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const PRESEEDED_MODEL_IDS = [
    'openai/gpt-5',
    'google/gemini-2.5-pro',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-sonnet-4',
    'anthropic/claude-opus-4.1',
    'x-ai/grok-4-fast',
];

const ModelSelectorDialog: React.FC<ModelSelectorDialogProps> = ({ open, onOpenChange }) => {
    const { selectedModel, setSelectedModel, usageCounts } = useModelPreference();
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadModels = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetchAvailableModels();
            const supplemented = [...response];
            for (const modelId of PRESEEDED_MODEL_IDS) {
                if (!supplemented.some((model) => model.id === modelId)) {
                    supplemented.push({ id: modelId, name: modelId });
                }
            }
            setModels(supplemented);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load models');
            setModels([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) {
            setSearchTerm('');
            setError(null);
            return;
        }

        loadModels();
    }, [open, loadModels]);

    const filteredModels = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const filtered = term
            ? models.filter((model) => {
                  const haystacks = [model.id, model.name, model.description]
                      .filter((value): value is string => typeof value === 'string')
                      .map((value) => value.toLowerCase());
                  return haystacks.some((value) => value.includes(term));
              })
            : models;

        return filtered
            .map((model) => ({
                model,
                usage: usageCounts[model.id] ?? 0,
            }))
            .sort((a, b) => {
                if (b.usage !== a.usage) return b.usage - a.usage;
                return a.model.id.localeCompare(b.model.id);
            })
            .map(({ model }) => model);
    }, [models, searchTerm, usageCounts]);

    const handleSelect = (model: OpenRouterModel) => {
        setSelectedModel({ id: model.id, label: model.name || model.id });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Select an AI Model</DialogTitle>
                    <DialogDescription>
                        Choose which model powers your next response. Usage counts reflect the last 72 hours of activity.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <Input
                        placeholder="Search models..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        autoFocus
                    />
                    <div className="min-h-[260px] rounded-md border">
                        {loading ? (
                            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                                Loading models...
                            </div>
                        ) : error ? (
                            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                                <p>{error}</p>
                                <Button size="sm" variant="outline" onClick={loadModels}>
                                    Retry
                                </Button>
                            </div>
                        ) : (
                            <ScrollArea className="h-64">
                                <div className="flex flex-col divide-y">
                                    {filteredModels.map((model) => {
                                        const usage = usageCounts[model.id] ?? 0;
                                        const isActive = selectedModel?.id === model.id;
                                        return (
                                            <button
                                                type="button"
                                                key={model.id}
                                                onClick={() => handleSelect(model)}
                                                className={cn(
                                                    'flex flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted',
                                                    isActive ? 'bg-primary/5' : ''
                                                )}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="font-medium">{model.name || model.id}</p>
                                                        <p className="text-xs text-muted-foreground">{model.id}</p>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">{usage} uses</div>
                                                </div>
                                                {model.description ? (
                                                    <p className="text-xs text-muted-foreground line-clamp-2">{model.description}</p>
                                                ) : null}
                                            </button>
                                        );
                                    })}
                                    {filteredModels.length === 0 && !loading && !error ? (
                                        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                                            No models match your search.
                                        </div>
                                    ) : null}
                                </div>
                            </ScrollArea>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ModelSelectorDialog;
