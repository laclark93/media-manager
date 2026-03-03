import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { SubtitleMissing } from '../types/anime';

export function useSubtitleCheck() {
  const [items, setItems] = useState<SubtitleMissing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sonarr, radarr] = await Promise.allSettled([
        fetchApi<SubtitleMissing[]>('/api/sonarr/subtitle-check'),
        fetchApi<SubtitleMissing[]>('/api/radarr/subtitle-check'),
      ]);
      const results: SubtitleMissing[] = [];
      if (sonarr.status === 'fulfilled') results.push(...sonarr.value);
      if (radarr.status === 'fulfilled') results.push(...radarr.value);
      results.sort((a, b) => a.title.localeCompare(b.title));
      setItems(results);
      if (sonarr.status === 'rejected' && radarr.status === 'rejected') {
        setError('Failed to fetch subtitle data from Sonarr and Radarr');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch subtitle check data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, loading, error, refresh };
}
