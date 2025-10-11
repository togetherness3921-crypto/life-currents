import { useEffect, useMemo, useState } from 'react';
import { GitPullRequest, Loader2, GitMerge } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { usePreviewBuilds } from '@/hooks/usePreviewBuilds';
import { useToast } from '@/hooks/use-toast';

const MAX_BADGE_COUNT = 99;

const PreviewBuildsWidget = () => {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const {
    builds,
    loading,
    error,
    unseenCount,
    committingPrNumbers,
    markBuildSeen,
    markAllSeen,
    commitBuild,
  } = usePreviewBuilds();

  const hasUnseen = unseenCount > 0;

  useEffect(() => {
    if (!hasUnseen && open) {
      setOpen(false);
    }
  }, [hasUnseen, open]);

  const formattedUnseenCount = useMemo(
    () => (unseenCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unseenCount),
    [unseenCount],
  );

  const buttonLabel = hasUnseen
    ? `${unseenCount} preview ${unseenCount === 1 ? 'build' : 'builds'} ready for review`
    : 'Preview builds';

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  const handleViewPreview = async (build: (typeof builds)[number]) => {
    const trimmedUrl = (build.preview_url ?? '').trim().replace(/'+$/, '');
    console.debug('[PreviewBuilds] View clicked', {
      rawUrl: build.preview_url,
      trimmedUrl,
      locationHref: window.location.href,
    });

    if (!trimmedUrl) {
      console.warn('[PreviewBuilds] View aborted because trimmed URL is empty');
      toast({
        variant: 'destructive',
        title: 'Preview unavailable',
        description: 'Could not open the preview URL because it was empty.',
      });
      return;
    }

    try {
      await markBuildSeen(build);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update preview visibility.';
      console.error('[PreviewBuilds] Failed to mark preview as viewed', { error, message, prNumber: build.pr_number });
      toast({
        variant: 'destructive',
        title: 'Unable to update preview status',
        description: message,
      });
    } finally {
      try {
        window.location.assign(trimmedUrl);
      } catch (navigationError) {
        console.error('[PreviewBuilds] Failed to navigate to preview URL', navigationError);
        toast({
          variant: 'destructive',
          title: 'Failed to open preview',
          description:
            navigationError instanceof Error
              ? navigationError.message
              : 'Unexpected error when opening preview.',
        });
      }
    }
  };

  const handleCommit = async (build: (typeof builds)[number]) => {
    console.debug('[PreviewBuilds] Commit clicked', {
      prNumber: build.pr_number,
      status: build.status,
      previewUrl: build.preview_url,
    });
    try {
      await markAllSeen().catch((markError) => {
        const message = markError instanceof Error ? markError.message : 'Failed to update preview visibility.';
        console.error('[PreviewBuilds] Failed to mark all builds seen before commit', {
          error: markError,
          message,
        });
        toast({
          variant: 'destructive',
          title: 'Unable to update preview status',
          description: message,
        });
      });
      await commitBuild(build);
      console.debug('[PreviewBuilds] Commit completed', { prNumber: build.pr_number });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred while starting the merge.';
      console.error('[PreviewBuilds] Commit failed', {
        prNumber: build.pr_number,
        errorMessage: message,
        error,
      });
      toast({
        variant: 'destructive',
        title: 'Failed to dispatch merge workflow',
        description: message,
      });
    }
  };

  if (!hasUnseen && !open) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="default"
          className={cn(
            'fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            hasUnseen ? 'animate-[pulse_2s_ease-in-out_infinite]' : 'hover:translate-y-[-2px]'
          )}
          aria-label={buttonLabel}
        >
          <GitPullRequest className="h-6 w-6" aria-hidden="true" />
          <span className="sr-only">{buttonLabel}</span>
          {hasUnseen && (
            <span className="pointer-events-none absolute -top-1.5 -right-1.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-destructive-foreground">
              {formattedUnseenCount}
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
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {builds.map((build) => {
                const isCommitting = committingPrNumbers.has(build.pr_number);
                const isCommitted = build.status === 'committed';
                const commitDisabled = isCommitted || isCommitting;
                const commitLabel = isCommitted ? 'Committed' : isCommitting ? 'Committing…' : 'Commit';
                const displayPreviewUrl = (build.preview_url ?? '').trim().replace(/'+$/, '');
                const createdAtLabel = build.created_at
                  ? new Date(build.created_at).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : 'Creation time unavailable';
                const statusLabel = isCommitted ? 'Committed' : 'Pending review';

                return (
                  <div
                    key={build.id ?? build.pr_number}
                    className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-sm transition hover:border-primary/50"
                  >
                    <div className="flex flex-col gap-1">
                      <a
                        href={build.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        PR #{build.pr_number}
                      </a>
                      <p className="text-xs text-muted-foreground">{createdAtLabel}</p>
                      <p className="text-xs font-medium text-muted-foreground">Status: {statusLabel}</p>
                      <p className="break-all text-xs text-muted-foreground">
                        {displayPreviewUrl || 'Preview URL unavailable'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleViewPreview(build)}
                      >
                        View
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PreviewBuildsWidget;
