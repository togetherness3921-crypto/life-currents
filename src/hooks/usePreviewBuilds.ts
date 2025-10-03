import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type PreviewBuildRow = Database["public"]["Tables"]["preview_builds"]["Row"];

type CommitState = Record<string, boolean>;

const sortBuilds = (builds: PreviewBuildRow[]): PreviewBuildRow[] => {
  return [...builds].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

    if (aTime !== bTime) {
      return bTime - aTime;
    }

    return b.pr_number - a.pr_number;
  });
};

const GITHUB_OWNER = import.meta.env.VITE_GITHUB_OWNER;
const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO;
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN;
const GITHUB_WORKFLOW_ID = import.meta.env.VITE_GITHUB_MERGE_WORKFLOW_ID ?? "merge_pr.yml";

export const usePreviewBuilds = () => {
  const [builds, setBuilds] = useState<PreviewBuildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commitState, setCommitState] = useState<CommitState>({});

  const fetchBuilds = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("preview_builds")
        .select("*")
        .order("created_at", { ascending: false })
        .order("pr_number", { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      setBuilds(sortBuilds(data ?? []));
    } catch (fetchErr) {
      const message =
        fetchErr instanceof Error
          ? fetchErr.message
          : "Failed to load preview builds from Supabase.";
      setError(message);
      setBuilds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBuilds();
  }, [fetchBuilds]);

  useEffect(() => {
    const channel = supabase
      .channel("preview_builds_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "preview_builds",
        },
        (payload) => {
          setBuilds((current) => {
            const next = [...current];

            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              const newRow = payload.new as PreviewBuildRow | null;
              if (!newRow) {
                return current;
              }

              const existingIndex = next.findIndex((build) => build.id === newRow.id);

              if (existingIndex >= 0) {
                next[existingIndex] = newRow;
              } else {
                next.push(newRow);
              }

              return sortBuilds(next);
            }

            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as PreviewBuildRow | null;
              if (!oldRow) {
                return current;
              }

              return next.filter((build) => build.id !== oldRow.id);
            }

            return current;
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    setCommitState((prev) => {
      const next: CommitState = {};
      let changed = false;

      for (const build of builds) {
        if (prev[build.id] && build.status !== "committed") {
          next[build.id] = true;
        }

        if (prev[build.id] && build.status === "committed") {
          changed = true;
        }
      }

      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [builds]);

  const markAllAsSeen = useCallback(async () => {
    const unseenIds = builds.filter((build) => !build.is_seen).map((build) => build.id);

    if (unseenIds.length === 0) {
      return;
    }

    setBuilds((current) =>
      current.map((build) =>
        unseenIds.includes(build.id)
          ? {
              ...build,
              is_seen: true,
            }
          : build
      )
    );

    const { error: updateError } = await supabase
      .from("preview_builds")
      .update({ is_seen: true })
      .in("id", unseenIds);

    if (updateError) {
      setBuilds((current) =>
        current.map((build) =>
          unseenIds.includes(build.id)
            ? {
                ...build,
                is_seen: false,
              }
            : build
        )
      );

      throw updateError;
    }
  }, [builds]);

  const commitBuild = useCallback(
    async (build: PreviewBuildRow) => {
      if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
        throw new Error("GitHub workflow configuration is missing. Please check your environment variables.");
      }

      setCommitState((prev) => ({ ...prev, [build.id]: true }));

      try {
        const response = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_ID}/dispatches`,
          {
            method: "POST",
            headers: {
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${GITHUB_TOKEN}`,
            },
            body: JSON.stringify({
              ref: "main",
              inputs: {
                pr_number: String(build.pr_number),
              },
            }),
          }
        );

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Failed to dispatch merge workflow for PR #${build.pr_number}: ${response.status} ${response.statusText} - ${errorBody}`
          );
        }
      } catch (dispatchError) {
        setCommitState((prev) => {
          const { [build.id]: _removed, ...rest } = prev;
          return rest;
        });
        throw dispatchError;
      }
    },
    []
  );

  const unseenCount = useMemo(() => builds.filter((build) => !build.is_seen).length, [builds]);

  return {
    builds,
    loading,
    error,
    unseenCount,
    hasUnseen: unseenCount > 0,
    markAllAsSeen,
    commitBuild,
    committing: commitState,
    refresh: fetchBuilds,
  };
};

export type { PreviewBuildRow };
