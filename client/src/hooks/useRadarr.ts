import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { createCache, REFRESH_INTERVAL } from '../utils/cache';
import { RadarrMovie } from '../types/radarr';

const cache = createCache<RadarrMovie[]>();

export function useRadarr() {
  const cached = cache.get();
  const [movies, setMovies] = useState<RadarrMovie[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (force: boolean) => {
    if (!force && !cache.isStale()) return;
    const showSpinner = force || !cache.get();
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<RadarrMovie[]>('/api/radarr/movies');
      cache.set(data);
      setMovies(data);
    } catch (err) {
      if (showSpinner) setError(err instanceof Error ? err.message : 'Failed to fetch movies');
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

  const searchMovie = useCallback(async (movieId: number) => {
    await fetchApi('/api/radarr/search', {
      method: 'POST',
      body: JSON.stringify({ movieId }),
    });
  }, []);

  return { movies, loading, error, refresh, searchMovie };
}
