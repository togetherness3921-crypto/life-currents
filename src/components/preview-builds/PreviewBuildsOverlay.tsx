import { useEffect, useMemo, useState } from 'react';
import { GitCommit, Loader2 } from 'lucide-react';

import { usePreviewBuilds } from '@/hooks/usePreviewBuilds';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const formatStatus = (status: string | null) => {
  if (status === 'committed') {
    return 'Committed';
  }
  return 'Pending Review';
};

const PreviewBuildsOverlay = () => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { builds, loading, error, unseenCount, markAllAsSeen, requestCommit, getCommitStateForBuild } =
    usePreviewBuilds();

  useEffect(() => {
    if (open) {
      void markAllAsSeen();
    }
  }, [open, markAllAsSeen]);

  const handleCommit = async (buildId: string) => {
    const build = builds.find((item) => item.id === buildId);
    if (!build) {
      return;
    }

    try {
      await requestCommit(build);
      toast({
        title: 'Merge requested',
        description: `Dispatching merge workflow for PR #${build.pr_number}.`,
      });
    } catch (commitError) {
      const description = commitError instanceof Error ? commitError.message : 'Unknown error';
      toast({
        title: 'Failed to start merge',
        description,
        variant: 'destructive',
      });
    }
  };

  const badgeLabel = useMemo(() => {
    if (unseenCount === 0) {
      return null;
    }
    if (unseenCount > 9) {
      return '9+';
    }
    return unseenCount.toString();
  }, [unseenCount]);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          unseenCount > 0 && 'bg-accent text-accent-foreground animate-preview-attention'
        )}
        aria-label={
          unseenCount > 0
            ? `Preview builds ready for review: ${unseenCount}`
            : 'Preview build notifications'
        }
      >
        <GitCommit className="h-6 w-6" aria-hidden="true" />
        {badgeLabel && (
          <span className="absolute -top-1 -right-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-destructive-foreground">
            {badgeLabel}
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Preview Builds</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading preview builds…</span>
              </div>
            ) : builds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No preview builds are currently available. Trigger a new prompt-to-preview workflow to see builds here.
              </p>
            ) : (
              <ScrollArea className="max-h-[420px] pr-4">
                <div className="space-y-3">
                  {builds.map((build) => {
                    const { disabled, label } = getCommitStateForBuild(build);
                    const viewDisabled = !build.preview_url;

                    return (
                      <div
                        key={build.id}
                        className="flex flex-col gap-3 rounded-lg border border-border bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <a
                              href={build.pr_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                            >
                              PR #{build.pr_number}
                            </a>
                            <Badge variant={build.status === 'committed' ? 'secondary' : 'outline'}>
                              {formatStatus(build.status)}
                            </Badge>
                          </div>
                          {build.preview_url ? (
                            <p className="text-xs text-muted-foreground break-all">{build.preview_url}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Preview URL pending deployment…</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={viewDisabled}
                            onClick={() => {
                              if (build.preview_url) {
                                window.open(build.preview_url, '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleCommit(build.id)}
                            disabled={disabled}
                          >
                            {label}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PreviewBuildsOverlay;
