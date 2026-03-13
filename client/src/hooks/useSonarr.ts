import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { createCache, REFRESH_INTERVAL } from '../utils/cache';
import { SonarrSeries, SonarrEpisode, MissingTimelineEntry } from '../types/sonarr';
import { useSetBackgroundLoading } from './useBackgroundLoading';

const cache = createCache<SonarrSeries[]>('mm:sonarr');

export function useSonarr() {
  const cached = cache.get();
  const [series, setSeries] = useState<SonarrSeries[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);
  const setBgLoading = useSetBackgroundLoading('sonarr');

  const fetchData = useCallback(async (force: boolean) => {
    if (!force && !cache.isStale()) return;
    const firstLoad = !cache.get();
    if (firstLoad) setLoading(true);
    else setBgLoading(true);
    setError(null);
    const opts = force ? { headers: { 'X-Manual-Refresh': '1' } } : undefined;
    try {
      const data = await fetchApi<SonarrSeries[]>('/api/sonarr/series', opts);
      cache.set(data);
      setSeries(data);
    } catch (err) {
      if (firstLoad) setError(err instanceof Error ? err.message : 'Failed to fetch series');
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

  const searchSeries = useCallback(async (seriesId: number, instanceUrl?: string) => {
    await fetchApi('/api/sonarr/search/series', {
      method: 'POST',
      body: JSON.stringify({ seriesId, instanceUrl }),
    });
  }, []);

  const searchEpisodes = useCallback(async (episodeIds: number[], instanceUrl?: string) => {
    await fetchApi('/api/sonarr/search/episodes', {
      method: 'POST',
      body: JSON.stringify({ episodeIds, instanceUrl }),
    });
  }, []);

  const getMissingEpisodes = useCallback(async (seriesId: number, instanceUrl?: string): Promise<SonarrEpisode[]> => {
    const qs = instanceUrl ? `&instanceUrl=${encodeURIComponent(instanceUrl)}` : '';
    return fetchApi<SonarrEpisode[]>(`/api/sonarr/episodes?seriesId=${seriesId}${qs}`);
  }, []);

  const getMissingTimeline = useCallback(async (): Promise<MissingTimelineEntry[]> => {
    return fetchApi<MissingTimelineEntry[]>('/api/sonarr/missing-timeline');
  }, []);

  return { series, loading, error, refresh, searchSeries, searchEpisodes, getMissingEpisodes, getMissingTimeline };
}
