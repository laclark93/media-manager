import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { createCache, REFRESH_INTERVAL } from '../utils/cache';
import { SonarrSeries, SonarrEpisode } from '../types/sonarr';

const cache = createCache<SonarrSeries[]>();

export function useSonarr() {
  const cached = cache.get();
  const [series, setSeries] = useState<SonarrSeries[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (force: boolean) => {
    if (!force && !cache.isStale()) return;
    const showSpinner = force || !cache.get();
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<SonarrSeries[]>('/api/sonarr/series');
      cache.set(data);
      setSeries(data);
    } catch (err) {
      if (showSpinner) setError(err instanceof Error ? err.message : 'Failed to fetch series');
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

  const searchSeries = useCallback(async (seriesId: number) => {
    await fetchApi('/api/sonarr/search/series', {
      method: 'POST',
      body: JSON.stringify({ seriesId }),
    });
  }, []);

  const searchEpisodes = useCallback(async (episodeIds: number[]) => {
    await fetchApi('/api/sonarr/search/episodes', {
      method: 'POST',
      body: JSON.stringify({ episodeIds }),
    });
  }, []);

  const getMissingEpisodes = useCallback(async (seriesId: number): Promise<SonarrEpisode[]> => {
    return fetchApi<SonarrEpisode[]>(`/api/sonarr/episodes?seriesId=${seriesId}`);
  }, []);

  return { series, loading, error, refresh, searchSeries, searchEpisodes, getMissingEpisodes };
}
