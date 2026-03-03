import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { JellyseerrIssue } from '../types/jellyseerr';

export function useJellyseerr() {
  const [issues, setIssues] = useState<JellyseerrIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<JellyseerrIssue[]>('/api/jellyseerr/issues');
      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
