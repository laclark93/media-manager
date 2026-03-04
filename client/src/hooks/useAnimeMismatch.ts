import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { createCache, REFRESH_INTERVAL } from '../utils/cache';
import { AnimeMismatch } from '../types/anime';

const cache = createCache<AnimeMismatch[]>();

export function useAnimeMismatch() {
  const cached = cache.get();
  const [items, setItems] = useState<AnimeMismatch[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (force: boolean) => {
    if (!force && !cache.isStale()) return;
    const showSpinner = force || !cache.get();
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const [sonarr, radarr] = await Promise.allSettled([
        fetchApi<AnimeMismatch[]>('/api/sonarr/anime-check'),
        fetchApi<AnimeMismatch[]>('/api/radarr/anime-check'),
      ]);
      const results: AnimeMismatch[] = [];
      if (sonarr.status === 'fulfilled') results.push(...sonarr.value);
      if (radarr.status === 'fulfilled') results.push(...radarr.value);
      results.sort((a, b) => a.title.localeCompare(b.title));
      cache.set(results);
      setItems(results);
      if (sonarr.status === 'rejected' && radarr.status === 'rejected') {
        if (showSpinner) setError('Failed to fetch data from Sonarr and Radarr');
      }
    } catch (err) {
      if (showSpinner) setError(err instanceof Error ? err.message : 'Failed to fetch anime check data');
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

  return { items, loading, error, refresh };
}
