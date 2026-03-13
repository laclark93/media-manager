import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { createCache, REFRESH_INTERVAL } from '../utils/cache';
import { AnimeMismatch } from '../types/anime';
import { useSetBackgroundLoading } from './useBackgroundLoading';

const cache = createCache<AnimeMismatch[]>('mm:animeMismatch');

export function useAnimeMismatch() {
  const cached = cache.get();
  const [items, setItems] = useState<AnimeMismatch[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(cached?.fetchedAt && cached.fetchedAt > 0 ? cached.fetchedAt : null);
  const setBgLoading = useSetBackgroundLoading('animeMismatch');

  const fetchData = useCallback(async (force: boolean) => {
    if (!force && !cache.isStale()) return;
    const firstLoad = !cache.get();
    if (firstLoad) setLoading(true);
    else setBgLoading(true);
    setError(null);
    const opts = force ? { headers: { 'X-Manual-Refresh': '1' } } : undefined;
    try {
      const [sonarr, radarr] = await Promise.allSettled([
        fetchApi<AnimeMismatch[]>('/api/sonarr/anime-check', opts),
        fetchApi<AnimeMismatch[]>('/api/radarr/anime-check', opts),
      ]);
      const results: AnimeMismatch[] = [];
      if (sonarr.status === 'fulfilled') results.push(...sonarr.value);
      if (radarr.status === 'fulfilled') results.push(...radarr.value);
      results.sort((a, b) => a.title.localeCompare(b.title));
      cache.set(results);
      setItems(results);
      setLastUpdated(Date.now());
      if (sonarr.status === 'rejected' && radarr.status === 'rejected') {
        if (firstLoad) setError('Failed to fetch data from Sonarr and Radarr');
      }
    } catch (err) {
      if (firstLoad) setError(err instanceof Error ? err.message : 'Failed to fetch anime check data');
    } finally {
      if (firstLoad) setLoading(false);
      setBgLoading(false);
    }
  }, [setBgLoading]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  useEffect(() => {
    fetchData(false);
    const timer = setInterval(() => fetchData(false), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchData]);

  return { items, loading, error, refresh, lastUpdated };
}
