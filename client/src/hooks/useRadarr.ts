import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { createCache, REFRESH_INTERVAL } from '../utils/cache';
import { RadarrMovie } from '../types/radarr';
import { useSetBackgroundLoading } from './useBackgroundLoading';

const cache = createCache<RadarrMovie[]>('mm:radarr');

export function useRadarr() {
  const cached = cache.get();
  const [movies, setMovies] = useState<RadarrMovie[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const setBgLoading = useSetBackgroundLoading('radarr');

  const fetchData = useCallback(async (force: boolean) => {
    if (!force && !cache.isStale()) return;
    const firstLoad = !cache.get();
    if (firstLoad) setLoading(true);
    else setBgLoading(true);
    setError(null);
    const opts = force ? { headers: { 'X-Manual-Refresh': '1' } } : undefined;
    try {
      const data = await fetchApi<RadarrMovie[]>('/api/radarr/movies', opts);
      cache.set(data);
      setMovies(data);
    } catch (err) {
      if (firstLoad) setError(err instanceof Error ? err.message : 'Failed to fetch movies');
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

  const searchMovie = useCallback(async (movieId: number, instanceUrl?: string) => {
    await fetchApi('/api/radarr/search', {
      method: 'POST',
      body: JSON.stringify({ movieId, instanceUrl }),
    });
  }, []);

  return { movies, loading, error, refresh, searchMovie };
}
