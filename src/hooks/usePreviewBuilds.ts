import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { dispatchMergeWorkflow } from '@/services/github';

type PreviewBuild = Database['public']['Tables']['preview_builds']['Row'];

type PreviewBuildStatus = PreviewBuild['status'];

type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

type PreviewBuildsState = {
  builds: PreviewBuild[];
  loading: boolean;
  error: string | null;
  committing: Set<number>;
};

const getSortValue = (build: PreviewBuild) => {
  if (build.created_at) {
    const parsed = Date.parse(build.created_at);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return build.pr_number;
};

const sortBuilds = (list: PreviewBuild[]) =>
  [...list].sort((a, b) => getSortValue(b) - getSortValue(a));

const getBuildKey = (build: PreviewBuild) => build.id ?? String(build.pr_number);

export const usePreviewBuilds = () => {
  const [state, setState] = useState<PreviewBuildsState>({
    builds: [],
    loading: true,
    error: null,
    committing: new Set<number>(),
  });
  const setCommitting = useCallback((updater: (prev: Set<number>) => Set<number>) => {
    setState((prev) => ({
      ...prev,
      committing: updater(prev.committing),
    }));
  }, []);

  const fetchBuilds = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data, error } = await supabase
        .from('preview_builds')
        .select('*')
        .order('created_at', { ascending: false })
        .order('pr_number', { ascending: false });

      if (error) {
        throw error;
      }

      setState((prev) => ({
        ...prev,
        builds: sortBuilds(data ?? []),
        loading: false,
        error: null,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        builds: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load preview builds',
      }));
    }
  }, []);

  useEffect(() => {
    fetchBuilds().catch((error) => {
      console.error('Failed to load preview builds:', error);
    });
  }, [fetchBuilds]);

  useEffect(() => {
    const channel = (supabase as any)
      .channel('preview_builds_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preview_builds' }, (payload: any) => {
        setState((prev) => {
          const eventType = (payload?.eventType || payload?.event) as RealtimeEvent | undefined;
          const next = [...prev.builds];

          if (eventType === 'DELETE' && payload?.old) {
            const key = getBuildKey(payload.old as PreviewBuild);
            return {
              ...prev,
              builds: next.filter((build) => getBuildKey(build) !== key),
            };
          }

          if ((eventType === 'INSERT' || eventType === 'UPDATE') && payload?.new) {
            const newRow = payload.new as PreviewBuild;
            const key = getBuildKey(newRow);
            const filtered = next.filter((build) => getBuildKey(build) !== key);
            filtered.unshift(newRow);
            return {
              ...prev,
              builds: sortBuilds(filtered),
            };
          }

          return prev;
        });
      })
      .subscribe();

    return () => {
      try {
        (supabase as any).removeChannel(channel);
      } catch (error) {
        console.error('Failed to remove preview_builds channel', error);
      }
    };
  }, []);

  useEffect(() => {
    setState((prev) => {
      if (prev.committing.size === 0) {
        return prev;
      }

      let changed = false;
      const remaining = new Set<number>();
      prev.committing.forEach((prNumber) => {
        const build = prev.builds.find((item) => item.pr_number === prNumber);
        if (!build || build.status === 'committed') {
          changed = true;
          return;
        }
        remaining.add(prNumber);
      });

      if (!changed) {
        return prev;
      }

      return {
        ...prev,
        committing: remaining,
      };
    });
  }, [state.builds]);

  const unseenCount = useMemo(
    () => state.builds.filter((build) => !build.is_seen).length,
    [state.builds],
  );

  const markAllSeen = useCallback(async () => {
    let shouldSync = false;
    setState((prev) => {
      const hasUnseen = prev.builds.some((build) => !build.is_seen);
      if (!hasUnseen) {
        return prev;
      }
      shouldSync = true;
      return {
        ...prev,
        builds: prev.builds.map((build) => (build.is_seen ? build : { ...build, is_seen: true })),
      };
    });

    if (!shouldSync) {
      return;
    }

    const { error } = await supabase
      .from('preview_builds')
      .update({ is_seen: true })
      .eq('is_seen', false);

    if (error) {
      await fetchBuilds();
      throw error;
    }
  }, [fetchBuilds]);

  const markBuildSeen = useCallback(
    async (build: PreviewBuild) => {
      if (!build) {
        return;
      }

      const buildKey = getBuildKey(build);
      let original: PreviewBuild | null = null;

      setState((prev) => {
        const index = prev.builds.findIndex((item) => getBuildKey(item) === buildKey);
        if (index === -1) {
          return prev;
        }

        const target = prev.builds[index];
        if (target.is_seen) {
          return prev;
        }

        original = target;
        const nextBuilds = [...prev.builds];
        nextBuilds[index] = { ...target, is_seen: true };

        return {
          ...prev,
          builds: nextBuilds,
        };
      });

      if (!original) {
        return;
      }

      try {
        const query = supabase.from('preview_builds').update({ is_seen: true });
        if (build.id) {
          query.eq('id', build.id);
        } else {
          query.eq('pr_number', build.pr_number);
        }
        const { error } = await query;
        if (error) {
          throw error;
        }
      } catch (error) {
        setState((prev) => {
          const index = prev.builds.findIndex((item) => getBuildKey(item) === buildKey);
          if (index === -1 || !original) {
            return prev;
          }
          const nextBuilds = [...prev.builds];
          nextBuilds[index] = original;
          return {
            ...prev,
            builds: nextBuilds,
          };
        });
        throw error;
      }
    },
    [],
  );

  const commitBuild = useCallback(
    async (build: PreviewBuild) => {
      if (build.status === 'committed') {
        return;
      }

      setCommitting((prev) => {
        if (prev.has(build.pr_number)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(build.pr_number);
        return next;
      });

      try {
        await dispatchMergeWorkflow(build.pr_number);
        try {
          await markAllSeen();
        } catch (markError) {
          console.error('Failed to mark preview builds as viewed after commit', markError);
          throw markError instanceof Error
            ? markError
            : new Error('Failed to mark preview builds as viewed after commit.');
        }
      } catch (error) {
        setCommitting((prev) => {
          if (!prev.has(build.pr_number)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(build.pr_number);
          return next;
        });
        throw error;
      }
    },
    [markAllSeen, setCommitting],
  );

  const refresh = useCallback(() => fetchBuilds(), [fetchBuilds]);

  return {
    builds: state.builds,
    loading: state.loading,
    error: state.error,
    unseenCount,
    committingPrNumbers: state.committing as ReadonlySet<number>,
    markAllSeen,
    markBuildSeen,
    commitBuild,
    refresh,
  };
};

export type { PreviewBuild, PreviewBuildStatus };
