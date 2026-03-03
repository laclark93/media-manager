import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { SonarrSeries, SonarrEpisode } from '../types/sonarr';

export function useSonarr() {
  const [series, setSeries] = useState<SonarrSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<SonarrSeries[]>('/api/sonarr/series');
      setSeries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch series');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
