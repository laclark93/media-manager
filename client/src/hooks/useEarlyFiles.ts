import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { createCache, REFRESH_INTERVAL } from '../utils/cache';
import { EarlySeriesItem, EarlyMovieItem } from '../types/early';

const episodesCache = createCache<EarlySeriesItem[]>();
const moviesCache = createCache<EarlyMovieItem[]>();

export function useEarlyFiles() {
  const [episodes, setEpisodes] = useState<EarlySeriesItem[]>(episodesCache.get()?.data ?? []);
  const [movies, setMovies] = useState<EarlyMovieItem[]>(moviesCache.get()?.data ?? []);
  const [loading, setLoading] = useState(!episodesCache.get() && !moviesCache.get());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (force: boolean) => {
    if (!force && !episodesCache.isStale() && !moviesCache.isStale()) return;
    const showSpinner = force || (!episodesCache.get() && !moviesCache.get());
    if (showSpinner) setLoading(true);
    if (force) setRefreshing(true);
    setError(null);
    const opts = force ? { headers: { 'X-Manual-Refresh': '1' } } : undefined;
    try {
      const [sonarr, radarr] = await Promise.allSettled([
        fetchApi<EarlySeriesItem[]>('/api/sonarr/early', opts),
        fetchApi<EarlyMovieItem[]>('/api/radarr/early', opts),
      ]);
      if (sonarr.status === 'fulfilled') {
        episodesCache.set(sonarr.value);
        setEpisodes(sonarr.value);
      }
      if (radarr.status === 'fulfilled') {
        moviesCache.set(radarr.value);
        setMovies(radarr.value);
      }
      if (sonarr.status === 'rejected' && radarr.status === 'rejected') {
        if (showSpinner) setError('Failed to fetch early files data');
      }
    } catch (err) {
      if (showSpinner) setError(err instanceof Error ? err.message : 'Failed to fetch early files data');
    } finally {
      if (showSpinner) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  useEffect(() => {
    fetchData(false);
    const timer = setInterval(() => fetchData(false), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchData]);

  return { episodes, movies, loading, refreshing, error, refresh };
}
