import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { createCache, REFRESH_INTERVAL } from '../utils/cache';
import { JellyseerrIssue } from '../types/jellyseerr';

const cache = createCache<JellyseerrIssue[]>();

export function useJellyseerr() {
  const cached = cache.get();
  const [issues, setIssues] = useState<JellyseerrIssue[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (force: boolean) => {
    if (!force && !cache.isStale()) return;
    const showSpinner = force || !cache.get();
    if (showSpinner) setLoading(true);
    setError(null);
    const opts = force ? { headers: { 'X-Manual-Refresh': '1' } } : undefined;
    try {
      const data = await fetchApi<JellyseerrIssue[]>('/api/jellyseerr/issues', opts);
      cache.set(data);
      setIssues(data);
    } catch (err) {
      if (showSpinner) setError(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  useEffect(() => {
    fetchData(false);
    const timer = setInterval(() => fetchData(false), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchData]);

  const searchIssue = useCallback(async (
    issueId: number,
    data: {
      mediaType: 'movie' | 'tv';
      externalServiceId: number;
      problemSeason?: number;
      problemEpisode?: number;
    }
  ): Promise<void> => {
    await fetchApi(`/api/jellyseerr/issues/${issueId}/search`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }, []);

  // Marks resolved via API — does NOT remove from list (card handles undo window)
  const resolveIssue = useCallback(async (issueId: number): Promise<void> => {
    await fetchApi(`/api/jellyseerr/issues/${issueId}/resolve`, { method: 'POST' });
  }, []);

  // Re-opens a resolved issue via API
  const reopenIssue = useCallback(async (issueId: number): Promise<void> => {
    await fetchApi(`/api/jellyseerr/issues/${issueId}/reopen`, { method: 'POST' });
  }, []);

  // Removes an issue from the local list (called after undo window expires)
  const dismissIssue = useCallback((issueId: number) => {
    setIssues(prev => prev.filter(i => i.id !== issueId));
  }, []);

  return { issues, loading, error, refresh, searchIssue, resolveIssue, reopenIssue, dismissIssue };
}
