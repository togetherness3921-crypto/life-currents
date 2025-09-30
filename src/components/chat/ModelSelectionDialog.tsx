import React, { useEffect, useMemo, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAvailableModels, type ModelInfo } from '@/services/openRouter';
import useModelSelection from '@/hooks/useModelSelection';
import { cn } from '@/lib/utils';

interface ModelSelectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectModel: (model: { id: string; label?: string }) => void;
}

const ModelSelectionDialog: React.FC<ModelSelectionDialogProps> = ({ open, onOpenChange, onSelectModel }) => {
    const { selectedModel, getUsageScore } = useModelSelection();
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!open) return;
        let isMounted = true;
        setLoading(true);
        setError(null);

        getAvailableModels()
            .then((fetchedModels) => {
                if (!isMounted) return;
                setModels(fetchedModels);
            })
            .catch((err) => {
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
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const entries = models.map((model) => ({
            model,
            score: getUsageScore(model.id),
        }));

        const sorted = entries.sort((a, b) => b.score - a.score || a.model.name.localeCompare(b.model.name));

        if (!normalizedSearch) {
            return sorted.map((entry) => entry.model);
        }

        return sorted
            .filter((entry) => entry.model.name.toLowerCase().includes(normalizedSearch) || entry.model.id.toLowerCase().includes(normalizedSearch))
            .map((entry) => entry.model);
    }, [getUsageScore, models, searchTerm]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Select Model</DialogTitle>
                    <DialogDescription>Choose which model to use for your next response.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <Input
                        placeholder="Search models..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                    />
                    <div className="h-80">
                        {loading ? (
                            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading models...</div>
                        ) : error ? (
                            <div className="flex h-full items-center justify-center text-sm text-destructive">{error}</div>
                        ) : (
                            <ScrollArea className="h-full">
                                <div className="flex flex-col gap-2 pr-2">
                                    {filteredModels.map((model) => (
                                        <button
                                            key={model.id}
                                            type="button"
                                            onClick={() => onSelectModel({ id: model.id, label: model.name })}
                                            className={cn(
                                                'flex flex-col rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted',
                                                model.id === selectedModel.id ? 'border-primary bg-primary/5' : 'border-border'
                                            )}
                                        >
                                            <span className="text-sm font-medium">{model.name}</span>
                                            <span className="text-xs text-muted-foreground">{model.id}</span>
                                        </button>
                                    ))}
                                    {filteredModels.length === 0 && (
                                        <div className="py-8 text-center text-sm text-muted-foreground">
                                            No models matched your search.
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ModelSelectionDialog;

