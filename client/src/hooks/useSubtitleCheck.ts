import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { createCache, REFRESH_INTERVAL } from '../utils/cache';
import { SubtitleMissing } from '../types/anime';
import { useSetBackgroundLoading } from './useBackgroundLoading';

const cache = createCache<SubtitleMissing[]>('mm:subtitleCheck');

export function useSubtitleCheck() {
  const cached = cache.get();
  const [items, setItems] = useState<SubtitleMissing[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(cached?.fetchedAt && cached.fetchedAt > 0 ? cached.fetchedAt : null);
  const setBgLoading = useSetBackgroundLoading('subtitleCheck');

  const fetchData = useCallback(async (force: boolean) => {
    if (!force && !cache.isStale()) return;
    const firstLoad = !cache.get();
    if (firstLoad) setLoading(true);
    else setBgLoading(true);
    setError(null);
    const opts = force ? { headers: { 'X-Manual-Refresh': '1' } } : undefined;
    try {
      const [sonarr, radarr] = await Promise.allSettled([
        fetchApi<SubtitleMissing[]>('/api/sonarr/subtitle-check', opts),
        fetchApi<SubtitleMissing[]>('/api/radarr/subtitle-check', opts),
      ]);
      const results: SubtitleMissing[] = [];
      if (sonarr.status === 'fulfilled') results.push(...sonarr.value);
      if (radarr.status === 'fulfilled') results.push(...radarr.value);
      results.sort((a, b) => a.title.localeCompare(b.title));
      cache.set(results);
      setItems(results);
      setLastUpdated(Date.now());
      if (sonarr.status === 'rejected' && radarr.status === 'rejected') {
        if (firstLoad) setError('Failed to fetch subtitle data from Sonarr and Radarr');
      }
    } catch (err) {
      if (firstLoad) setError(err instanceof Error ? err.message : 'Failed to fetch subtitle check data');
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
