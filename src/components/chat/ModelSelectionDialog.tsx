import React, { useEffect, useMemo, useState } from 'react';
import {
    CommandDialog,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { useModelSelection } from '@/hooks/useModelSelection';
import { fetchOpenRouterModels, type OpenRouterModel } from '@/services/openRouter';
import { PRESEEDED_MODEL_USAGE } from '@/hooks/modelSelectionProviderContext';
import { Check, Loader2 } from 'lucide-react';

interface ModelSelectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface ModelWithUsage extends OpenRouterModel {
    usageScore: number;
}

export const ModelSelectionDialog: React.FC<ModelSelectionDialogProps> = ({ open, onOpenChange }) => {
    const { selectedModel, selectModel, getUsageScore } = useModelSelection();
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!open) {
            setSearchTerm('');
            return;
        }

        const controller = new AbortController();
        let isCancelled = false;

        const loadModels = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await fetchOpenRouterModels({ signal: controller.signal });
                if (isCancelled) return;
                setModels(result);
            } catch (err) {
                if (isCancelled) return;
                const message = err instanceof Error ? err.message : 'Failed to load models';
                setError(message);
                setModels([]);
            } finally {
                if (!isCancelled) {
                    setLoading(false);
                }
            }
        };

        loadModels();

        return () => {
            isCancelled = true;
            controller.abort();
        };
    }, [open]);

    const combinedModels = useMemo(() => {
        const modelMap = new Map<string, OpenRouterModel>();
        for (const model of models) {
            modelMap.set(model.id, model);
        }
        for (const modelId of Object.keys(PRESEEDED_MODEL_USAGE)) {
            if (!modelMap.has(modelId)) {
                modelMap.set(modelId, { id: modelId, name: modelId } as OpenRouterModel);
            }
        }
        return Array.from(modelMap.values());
    }, [models]);

    const modelsWithUsage = useMemo<ModelWithUsage[]>(() => {
        return combinedModels
            .map((model) => ({
                ...model,
                usageScore: getUsageScore(model.id),
            }))
            .sort((a, b) => {
                if (b.usageScore !== a.usageScore) {
                    return b.usageScore - a.usageScore;
                }
                return a.id.localeCompare(b.id);
            });
    }, [combinedModels, getUsageScore]);

    const filteredModels = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) {
            return modelsWithUsage;
        }
        return modelsWithUsage.filter((model) => {
            const label = (model.name ?? model.id).toLowerCase();
            return label.includes(term);
        });
    }, [modelsWithUsage, searchTerm]);

    const handleSelect = (model: ModelWithUsage) => {
        selectModel(model.id, { label: model.name ?? model.id });
        onOpenChange(false);
    };

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput
                placeholder="Search models..."
                value={searchTerm}
                onValueChange={setSearchTerm}
                autoFocus
            />
            <CommandList>
                {loading ? (
                    <div className="flex items-center justify-center px-4 py-6 text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading models...
                    </div>
                ) : error ? (
                    <div className="px-4 py-6 text-sm text-destructive">{error}</div>
                ) : filteredModels.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                        No models match your search.
                    </div>
                ) : (
                    <CommandGroup heading="Available Models">
                        {filteredModels.map((model) => {
                            const displayName = model.name ?? model.id;
                            return (
                                <CommandItem
                                    key={model.id}
                                    value={model.id}
                                    onSelect={() => handleSelect(model)}
                                    className="flex items-start gap-3"
                                >
                                    <div className="flex flex-1 flex-col gap-1">
                                        <span className="text-sm font-medium text-foreground">{displayName}</span>
                                        {model.description ? (
                                            <span className="text-xs text-muted-foreground truncate">
                                                {model.description}
                                            </span>
                                        ) : null}
                                        {model.context_length ? (
                                            <span className="text-[11px] text-muted-foreground">
                                                Context window: {model.context_length.toLocaleString()} tokens
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-foreground">
                                            {model.usageScore} uses
                                        </span>
                                        {selectedModel === model.id && (
                                            <Check className="h-4 w-4 text-primary" />
                                        )}
                                    </div>
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                )}
            </CommandList>
        </CommandDialog>
    );
};

export default ModelSelectionDialog;

