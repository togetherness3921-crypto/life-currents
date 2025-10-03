import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { triggerMergeWorkflow } from '@/services/githubActions';

export type PreviewBuild = Database['public']['Tables']['preview_builds']['Row'];

type PreviewBuildStatus = NonNullable<PreviewBuild['status']>;

type FetchState = {
  builds: PreviewBuild[];
  loading: boolean;
  error: string | null;
};

const sortBuilds = (rows: PreviewBuild[]) => {
  return [...rows].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
};

export const usePreviewBuilds = () => {
  const [state, setState] = useState<FetchState>({ builds: [], loading: true, error: null });
  const [pendingCommitIds, setPendingCommitIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: prev.builds.length === 0, error: null }));
    const { data, error } = await supabase
      .from('preview_builds')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setState((prev) => ({ ...prev, error: error.message, loading: false }));
      return;
    }

    setState({ builds: sortBuilds((data ?? []) as PreviewBuild[]), loading: false, error: null });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel('preview_builds_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'preview_builds' },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    setPendingCommitIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      let changed = false;
      const next = new Set(prev);
      state.builds.forEach((build) => {
        if (build.status === 'committed' && next.has(build.id)) {
          next.delete(build.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [state.builds]);

  const markAllAsSeen = useCallback(async () => {
    let updated = false;
    setState((prev) => {
      const hasUnseen = prev.builds.some((build) => !build.is_seen);
      if (!hasUnseen) {
        return prev;
      }
      updated = true;
      return {
        ...prev,
        builds: prev.builds.map((build) => (build.is_seen ? build : { ...build, is_seen: true })),
      };
    });

    if (!updated) {
      return;
    }

    const { error } = await supabase.from('preview_builds').update({ is_seen: true }).eq('is_seen', false);
    if (error) {
      setState((prev) => ({ ...prev, error: error.message }));
      void refresh();
    }
  }, [refresh]);

  const requestCommit = useCallback(
    async (build: PreviewBuild) => {
      setPendingCommitIds((prev) => {
        const next = new Set(prev);
        next.add(build.id);
        return next;
      });

      try {
        await triggerMergeWorkflow(build.pr_number);
      } catch (error) {
        setPendingCommitIds((prev) => {
          const next = new Set(prev);
          next.delete(build.id);
          return next;
        });
        throw error;
      }
    },
    []
  );

  const unseenCount = useMemo(() => state.builds.filter((build) => !build.is_seen).length, [state.builds]);

  const getCommitStateForBuild = useCallback(
    (build: PreviewBuild): { disabled: boolean; label: string } => {
      if (pendingCommitIds.has(build.id)) {
        return { disabled: true, label: 'Committing...' };
      }

      if ((build.status as PreviewBuildStatus | null) === 'committed') {
        return { disabled: true, label: 'Committed' };
      }

      return { disabled: false, label: 'Commit' };
    },
    [pendingCommitIds]
  );

  return {
    builds: state.builds,
    loading: state.loading,
    error: state.error,
    unseenCount,
    markAllAsSeen,
    requestCommit,
    getCommitStateForBuild,
    refresh,
  };
};
