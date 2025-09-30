import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '@/lib/utils';
import { listAvailableModels, type OpenRouterModelSummary } from '@/services/openRouter';
import { useModel } from '@/hooks/useModel';

interface ModelSelectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const ModelSelectionDialog = ({ open, onOpenChange }: ModelSelectionDialogProps) => {
    const { selectedModelId, setSelectedModel, usageCounts } = useModel();
    const [models, setModels] = useState<OpenRouterModelSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!open) return;
        let isMounted = true;
        setLoading(true);
        setError(null);
        setSearch('');

        listAvailableModels()
            .then((fetchedModels) => {
                if (!isMounted) return;
                setModels(fetchedModels);
            })
            .catch((err) => {
                console.error('[ModelSelectionDialog] Failed to fetch models', err);
                if (!isMounted) return;
                setError(err instanceof Error ? err.message : 'Failed to load models');
            })
            .finally(() => {
                if (!isMounted) return;
                setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [open]);

    const filteredModels = useMemo(() => {
        const normalized = search.trim().toLowerCase();
        if (!normalized) return models;
        return models.filter((model) => {
            const name = model.name?.toLowerCase() ?? '';
            const id = model.id.toLowerCase();
            return name.includes(normalized) || id.includes(normalized);
        });
    }, [models, search]);

    const sortedModels = useMemo(() => {
        return [...filteredModels].sort((a, b) => {
            const usageA = usageCounts[a.id] ?? 0;
            const usageB = usageCounts[b.id] ?? 0;
            if (usageA !== usageB) {
                return usageB - usageA;
            }
            const nameA = a.name ?? a.id;
            const nameB = b.name ?? b.id;
            return nameA.localeCompare(nameB);
        });
    }, [filteredModels, usageCounts]);

    const handleSelect = (model: OpenRouterModelSummary) => {
        setSelectedModel({ id: model.id, name: model.name });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Select AI model</DialogTitle>
                    <DialogDescription>
                        Pick which model should respond to your next message. Models are sorted by activity in the last 72 hours.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search models..."
                        autoFocus
                        disabled={loading}
                    />
                    <div className="rounded-md border">
                        <ScrollArea className="max-h-[360px]">
                            <div className="flex flex-col">
                                {loading && (
                                    <div className="px-4 py-6 text-sm text-muted-foreground">Loading models…</div>
                                )}
                                {!loading && error && (
                                    <div className="px-4 py-6 text-sm text-destructive">
                                        {error}
                                    </div>
                                )}
                                {!loading && !error && sortedModels.length === 0 && (
                                    <div className="px-4 py-6 text-sm text-muted-foreground">No models match your search.</div>
                                )}
                                {!loading && !error &&
                                    sortedModels.map((model) => {
                                        const usage = usageCounts[model.id] ?? 0;
                                        const isActive = model.id === selectedModelId;
                                        return (
                                            <button
                                                key={model.id}
                                                type="button"
                                                onClick={() => handleSelect(model)}
                                                className={cn(
                                                    'flex w-full flex-col items-start gap-1 border-b px-4 py-3 text-left transition-colors last:border-b-0',
                                                    isActive ? 'bg-muted/80' : 'hover:bg-muted/60'
                                                )}
                                            >
                                                <span className="text-sm font-medium text-foreground">
                                                    {model.name ?? model.id}
                                                </span>
                                                <span className="text-xs text-muted-foreground">{model.id}</span>
                                                <span className="text-xs text-muted-foreground">Used {usage} time{usage === 1 ? '' : 's'} (72h)</span>
                                            </button>
                                        );
                                    })}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ModelSelectionDialog;
