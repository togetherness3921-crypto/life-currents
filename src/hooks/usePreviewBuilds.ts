import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type PreviewBuild = Database['public']['Tables']['preview_builds']['Row'];

const sortBuilds = (builds: PreviewBuild[]) =>
  [...builds].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }
    return b.pr_number - a.pr_number;
  });

export const usePreviewBuilds = () => {
  const [builds, setBuilds] = useState<PreviewBuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBuilds = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('preview_builds')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    setBuilds(data ? sortBuilds(data as PreviewBuild[]) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchBuilds();
  }, [fetchBuilds]);

  useEffect(() => {
    const channel = supabase
      .channel('preview_builds_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preview_builds' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const next = payload.new as PreviewBuild | null;
          if (!next) return;
          setBuilds((previous) => sortBuilds([next, ...previous.filter((item) => item.pr_number !== next.pr_number)]));
          setError(null);
        }

        if (payload.eventType === 'DELETE') {
          const previous = payload.old as Partial<PreviewBuild> | null;
          if (!previous?.pr_number) return;
          setBuilds((existing) => existing.filter((item) => item.pr_number !== previous.pr_number));
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          setError('Real-time subscription to preview builds failed. Updates may be delayed.');
        }
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (subscriptionError) {
        console.error('Failed to remove preview_builds realtime channel', subscriptionError);
      }
    };
  }, []);

  const unseenCount = useMemo(() => builds.filter((build) => !build.is_seen).length, [builds]);

  const markAllAsSeen = useCallback(async () => {
    let hadChanges = false;
    setBuilds((previous) => {
      const next = previous.map((build) => {
        if (!build.is_seen) {
          hadChanges = true;
          return { ...build, is_seen: true };
        }
        return build;
      });
      return next;
    });

    if (!hadChanges) {
      return;
    }

    const { error: updateError } = await supabase
      .from('preview_builds')
      .update({ is_seen: true })
      .eq('is_seen', false);

    if (updateError) {
      setError(updateError.message);
      await fetchBuilds();
      throw updateError;
    }
  }, [fetchBuilds]);

  const refresh = useCallback(async () => {
    await fetchBuilds();
  }, [fetchBuilds]);

  return {
    builds,
    loading,
    error,
    unseenCount,
    markAllAsSeen,
    refresh,
    setError,
  };
};

export default usePreviewBuilds;
