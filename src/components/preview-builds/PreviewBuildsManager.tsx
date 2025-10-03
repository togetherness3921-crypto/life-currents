import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { usePreviewBuilds, type PreviewBuildRow } from "@/hooks/usePreviewBuilds";
import { cn } from "@/lib/utils";
import { Bell, Check, ExternalLink, GitMerge, Loader2 } from "lucide-react";

const formatTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toLocaleString();
  } catch (error) {
    console.warn("[PreviewBuilds] Failed to format timestamp", value, error);
    return null;
  }
};

const getCommitLabel = (
  build: PreviewBuildRow,
  isCommitting: boolean
): {
  label: string;
  icon: "spinner" | "check" | "merge";
  disabled: boolean;
} => {
  if (build.status === "committed") {
    return { label: "Committed", icon: "check", disabled: true };
  }

  if (isCommitting) {
    return { label: "Committing...", icon: "spinner", disabled: true };
  }

  return { label: "Commit", icon: "merge", disabled: false };
};

const PreviewBuildsManager = () => {
  const { toast } = useToast();
  const { builds, loading, error, unseenCount, hasUnseen, markAllAsSeen, commitBuild, committing } = usePreviewBuilds();
  const [open, setOpen] = useState(false);

  const unseenCountLabel = useMemo(() => {
    if (unseenCount > 99) {
      return "99+";
    }
    return unseenCount.toString();
  }, [unseenCount]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void markAllAsSeen().catch((markError) => {
      const description =
        markError instanceof Error ? markError.message : "Unable to update preview build notifications.";
      toast({
        title: "Failed to acknowledge builds",
        description,
        variant: "destructive",
      });
    });
  }, [markAllAsSeen, open, toast]);

  const handleCommit = useCallback(
    async (build: PreviewBuildRow) => {
      try {
        await commitBuild(build);
        toast({
          title: `Merge requested for PR #${build.pr_number}`,
          description: "The merge workflow has been dispatched. This will update automatically once complete.",
        });
      } catch (commitError) {
        const description =
          commitError instanceof Error ? commitError.message : "Unable to start the merge workflow.";
        toast({
          title: `Could not merge PR #${build.pr_number}`,
          description,
          variant: "destructive",
        });
      }
    },
    [commitBuild, toast]
  );

  const openPreview = useCallback((url: string) => {
    if (!url) {
      return;
    }

    const targetUrl = url.startsWith("http") ? url : `https://${url}`;

    if (typeof window !== "undefined") {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    }
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
    },
    []
  );

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <div className="relative">
          <Button
            type="button"
            variant={hasUnseen ? "default" : "secondary"}
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              hasUnseen ? "preview-builds-indicator-alert" : "hover:scale-105"
            )}
            onClick={() => setOpen(true)}
          >
            <Bell className="h-5 w-5" />
            <span className="sr-only">Review preview builds</span>
          </Button>
          {hasUnseen && (
            <Badge variant="destructive" className="pointer-events-none absolute -right-2 -top-2 min-h-6 px-2 py-0 text-xs">
              {unseenCountLabel}
            </Badge>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Preview Builds</DialogTitle>
            <DialogDescription>
              Review recently generated preview builds and merge the implementation that best fits the project.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive" className="mt-2">
              <AlertTitle>Unable to load preview builds</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading preview builds…</span>
              </div>
            ) : builds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No preview builds are available yet.</p>
            ) : (
              <ScrollArea className="max-h-[60vh] pr-2">
                <div className="flex flex-col gap-3">
                  {builds.map((build) => {
                    const isCommitting = Boolean(committing[build.id]);
                    const { label, icon, disabled } = getCommitLabel(build, isCommitting);
                    const timestamp = formatTimestamp(build.updated_at ?? build.created_at);
                    const hasPreview = Boolean(build.preview_url);

                    return (
                      <div key={build.id} className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3">
                            <a
                              href={build.pr_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                            >
                              PR #{build.pr_number}
                            </a>
                            <Badge variant={build.status === "committed" ? "secondary" : "outline"} className="capitalize">
                              {build.status.replace("_", " ")}
                            </Badge>
                          </div>
                          {timestamp && (
                            <p className="text-xs text-muted-foreground">Updated {timestamp}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!hasPreview}
                            onClick={() => openPreview(build.preview_url)}
                          >
                            <ExternalLink className="h-4 w-4" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            disabled={disabled}
                            onClick={() => handleCommit(build)}
                            className="min-w-[132px]"
                          >
                            {icon === "spinner" ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : icon === "check" ? (
                              <Check className="mr-2 h-4 w-4" />
                            ) : (
                              <GitMerge className="mr-2 h-4 w-4" />
                            )}
                            {label}
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
    </>
  );
};

export default PreviewBuildsManager;
