import React, { useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { fetchAvailableModels } from '@/services/openRouter';
import type { ModelOption } from '@/types/models';
import { getUsageCounts, PRESEEDED_MODELS } from '@/lib/modelUsage';
import { cn } from '@/lib/utils';

interface ModelSelectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedModelId: string;
    onSelect: (model: ModelOption) => void;
    usageVersion: number;
}

interface ModelWithUsage extends ModelOption {
    usage: number;
}

const ModelSelectionDialog: React.FC<ModelSelectionDialogProps> = ({
    open,
    onOpenChange,
    selectedModelId,
    onSelect,
    usageVersion,
}) => {
    const [models, setModels] = useState<ModelOption[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!open) return;
        let isActive = true;
        setLoading(true);
        setError(null);
        setSearchQuery('');

        fetchAvailableModels()
            .then((fetched) => {
                if (!isActive) return;
                const withFallbacks = [...fetched];
                Object.entries(PRESEEDED_MODELS).forEach(([modelId, label]) => {
                    if (!withFallbacks.some((model) => model.id === modelId)) {
                        withFallbacks.push({ id: modelId, name: label });
                    }
                });
                setModels(withFallbacks);
            })
            .catch((err) => {
                if (!isActive) return;
                console.error('Failed to fetch OpenRouter models:', err);
                setError(err instanceof Error ? err.message : 'Failed to load models.');
                const fallbackList = Object.entries(PRESEEDED_MODELS).map(([id, name]) => ({ id, name }));
                setModels(fallbackList);
            })
            .finally(() => {
                if (isActive) {
                    setLoading(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        try {
            setUsageCounts(getUsageCounts());
        } catch (err) {
            console.warn('Failed to compute model usage counts:', err);
            setUsageCounts({});
        }
    }, [open, usageVersion]);

    const filteredModels = useMemo<ModelWithUsage[]>(() => {
        const usageSnapshot = usageCounts;
        const query = searchQuery.trim().toLowerCase();

        const augmented = models.map((model) => ({
            ...model,
            usage: usageSnapshot[model.id] ?? 0,
        }));

        const filtered = query
            ? augmented.filter((model) => {
                  const idMatch = model.id.toLowerCase().includes(query);
                  const nameMatch = model.name?.toLowerCase().includes(query) ?? false;
                  return idMatch || nameMatch;
              })
            : augmented;

        return filtered.sort((a, b) => {
            if (b.usage !== a.usage) {
                return b.usage - a.usage;
            }
            return a.id.localeCompare(b.id);
        });
    }, [models, usageCounts, searchQuery]);

    const handleSelectModel = (model: ModelOption) => {
        onSelect(model);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Select a model for your next response</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <Input
                        placeholder="Search models..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        autoFocus
                    />
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                    <ScrollArea className="h-[420px] rounded-md border">
                        {loading ? (
                            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                                Loading models...
                            </div>
                        ) : filteredModels.length === 0 ? (
                            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                                No models match your search.
                            </div>
                        ) : (
                            <div className="divide-y">
                                {filteredModels.map((model) => {
                                    const usage = model.usage;
                                    const isSelected = selectedModelId === model.id;
                                    return (
                                        <button
                                            key={model.id}
                                            type="button"
                                            onClick={() => handleSelectModel(model)}
                                            className={cn(
                                                'flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted',
                                                isSelected ? 'bg-muted/70' : 'bg-background'
                                            )}
                                        >
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium text-foreground">
                                                    {model.name || model.id}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{model.id}</p>
                                                {model.description && (
                                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                                        {model.description}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <Badge variant="outline" className="font-normal">
                                                    Used {usage}×
                                                </Badge>
                                                {isSelected && (
                                                    <span className="text-xs font-semibold text-primary">Selected</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ModelSelectionDialog;
