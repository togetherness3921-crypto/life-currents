import { useState } from 'react';
import { GitPullRequest, ExternalLink, Loader2, GitMerge } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { usePreviewBuilds } from '@/hooks/usePreviewBuilds';
import { useToast } from '@/hooks/use-toast';

const MAX_BADGE_COUNT = 99;

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'committed':
      return 'Committed';
    case 'pending_review':
    default:
      return 'Pending Review';
  }
};

const PreviewBuildsWidget = () => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const {
    builds,
    loading,
    error,
    unseenCount,
    committingPrNumbers,
    markAllSeen,
    commitBuild,
  } = usePreviewBuilds();

  const hasUnseen = unseenCount > 0;

  const buttonLabel = hasUnseen
    ? `${unseenCount} preview ${unseenCount === 1 ? 'build' : 'builds'} ready for review`
    : 'Preview builds';

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      markAllSeen().catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to update build visibility.';
        toast({
          variant: 'destructive',
          title: 'Unable to mark builds as seen',
          description: message,
        });
      });
    }
  };

  const handleCommit = async (build: (typeof builds)[number]) => {
    try {
      await commitBuild(build);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred while starting the merge.';
      toast({
        variant: 'destructive',
        title: 'Failed to dispatch merge workflow',
        description: message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={hasUnseen ? 'default' : 'secondary'}
          className={cn(
            'fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            hasUnseen ? 'animate-[pulse_2s_ease-in-out_infinite]' : 'hover:translate-y-[-2px]'
          )}
          aria-label={buttonLabel}
        >
          <GitPullRequest className="h-6 w-6" aria-hidden="true" />
          <span className="sr-only">{buttonLabel}</span>
          {hasUnseen && (
            <span className="pointer-events-none absolute -top-1.5 -right-1.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-destructive-foreground">
              {unseenCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unseenCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <GitMerge className="h-5 w-5" aria-hidden="true" />
            Preview Builds
          </DialogTitle>
          <DialogDescription>
            Review generated preview builds before committing them to the main branch.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Loading builds…
            </div>
          )}
          {error && !loading && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!loading && !error && builds.length === 0 && (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              No preview builds are available right now.
            </div>
          )}
          {!loading && !error && builds.length > 0 && (
            <ScrollArea className="max-h-[420px] pr-4">
              <div className="space-y-3">
                {builds.map((build) => {
                  const isCommitting = committingPrNumbers.has(build.pr_number);
                  const isCommitted = build.status === 'committed';
                  const commitDisabled = isCommitted || isCommitting;
                  const commitLabel = isCommitted
                    ? 'Committed'
                    : isCommitting
                    ? 'Committing…'
                    : 'Commit';

                  return (
                    <div
                      key={build.id ?? build.pr_number}
                      className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm transition hover:border-primary/50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <a
                            href={build.pr_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
                          >
                            PR #{build.pr_number}
                          </a>
                          <Badge variant={isCommitted ? 'secondary' : 'outline'}>{getStatusLabel(build.status)}</Badge>
                        </div>
                        <a
                          href={build.preview_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                        >
                          {build.preview_url}
                        </a>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Button variant="outline" size="sm" asChild>
                          <a href={build.preview_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            View
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleCommit(build)}
                          disabled={commitDisabled}
                          aria-live="polite"
                        >
                          {isCommitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                          {commitLabel}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PreviewBuildsWidget;
