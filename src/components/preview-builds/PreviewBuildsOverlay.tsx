import { useEffect, useState } from 'react';
import { Bell, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import usePreviewBuilds, { type PreviewBuild } from '@/hooks/usePreviewBuilds';
import triggerMergeWorkflow from '@/services/githubWorkflows';
import { useToast } from '@/hooks/use-toast';

const BuildStatusBadge = ({ status }: { status: PreviewBuild['status'] }) => {
  if (status === 'committed') {
    return <Badge variant="secondary">Committed</Badge>;
  }
  return <Badge variant="outline">Pending review</Badge>;
};

const PreviewBuildsOverlay = () => {
  const {
    builds,
    loading,
    error,
    unseenCount,
    markAllAsSeen,
    refresh,
    setError: setPreviewBuildsError,
  } = usePreviewBuilds();
  const [panelOpen, setPanelOpen] = useState(false);
  const [pendingCommits, setPendingCommits] = useState<number[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!panelOpen || unseenCount === 0) {
      return;
    }

    const markSeen = async () => {
      try {
        await markAllAsSeen();
      } catch (markError) {
        toast({
          title: 'Unable to update build notifications',
          description:
            markError instanceof Error ? markError.message : 'Supabase did not accept the update request.',
          variant: 'destructive',
        });
      }
    };

    void markSeen();
  }, [panelOpen, unseenCount, markAllAsSeen, toast]);

  useEffect(() => {
    setPendingCommits((current) =>
      current.filter((prNumber) => {
        const build = builds.find((item) => item.pr_number === prNumber);
        return build ? build.status !== 'committed' : false;
      })
    );
  }, [builds]);

  const handleCommit = async (build: PreviewBuild) => {
    if (build.status === 'committed' || pendingCommits.includes(build.pr_number)) {
      return;
    }

    setPendingCommits((current) => [...current, build.pr_number]);

    try {
      await triggerMergeWorkflow(build.pr_number);
      toast({
        title: `Merge workflow dispatched`,
        description: `GitHub is merging PR #${build.pr_number}. This panel will update automatically once complete.`,
      });
    } catch (commitError) {
      setPendingCommits((current) => current.filter((value) => value !== build.pr_number));
      toast({
        title: 'Failed to trigger merge',
        description:
          commitError instanceof Error
            ? commitError.message
            : 'An unexpected error occurred while contacting GitHub.',
        variant: 'destructive',
      });
    }
  };

  const handleRetry = async () => {
    setPreviewBuildsError(null);
    await refresh();
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading preview builds…
        </div>
      );
    }

    if (error) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Unable to load preview builds</AlertTitle>
          <AlertDescription>
            <div className="space-y-3">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Try again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      );
    }

    if (builds.length === 0) {
      return (
        <div className="flex h-32 flex-col items-center justify-center space-y-2 text-center text-sm text-muted-foreground">
          <CheckCircle className="h-6 w-6 text-muted-foreground" />
          <p>No preview builds are waiting for review.</p>
        </div>
      );
    }

    return (
      <ScrollArea className="max-h-[60vh] pr-4">
        <div className="space-y-3">
          {builds.map((build) => {
            const isCommitted = build.status === 'committed';
            const isCommitting = pendingCommits.includes(build.pr_number) && !isCommitted;
            const commitLabel = isCommitted ? 'Committed' : isCommitting ? 'Committing…' : 'Commit';
            const commitDisabled = isCommitted || isCommitting;

            return (
              <div
                key={build.pr_number}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <a
                    href={build.pr_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    PR #{build.pr_number}
                  </a>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <BuildStatusBadge status={build.status} />
                    <span>Preview ready</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" size="sm" asChild>
                    <a href={build.preview_url} target="_blank" rel="noreferrer noopener">
                      View
                      <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleCommit(build)}
                    disabled={commitDisabled}
                    variant={isCommitted ? 'secondary' : 'default'}
                  >
                    {commitLabel}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    );
  };

  return (
    <>
      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Preview builds</DialogTitle>
            <DialogDescription>
              Review generated preview builds, open their deployments, or trigger a merge when you are satisfied.
            </DialogDescription>
          </DialogHeader>
          {renderContent()}
        </DialogContent>
      </Dialog>

      <Button
        type="button"
        variant={unseenCount > 0 ? 'default' : 'secondary'}
        onClick={() => setPanelOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 relative',
          unseenCount > 0 ? 'build-indicator-animate' : 'hover:scale-105'
        )}
        aria-label={
          unseenCount > 0
            ? `Open preview builds panel. ${unseenCount} new builds awaiting review.`
            : 'Open preview builds panel'
        }
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-destructive-foreground">
            {unseenCount > 99 ? '99+' : unseenCount}
          </span>
        )}
        <span className="sr-only">
          {unseenCount > 0
            ? `${unseenCount} preview builds waiting for review`
            : 'No new preview builds'}
        </span>
      </Button>
    </>
  );
};

export default PreviewBuildsOverlay;
