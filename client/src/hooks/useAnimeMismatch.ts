import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { AnimeMismatch } from '../types/anime';

export function useAnimeMismatch() {
  const [items, setItems] = useState<AnimeMismatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
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
      setItems(results);
      if (sonarr.status === 'rejected' && radarr.status === 'rejected') {
        setError('Failed to fetch data from Sonarr and Radarr');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch anime check data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { items, loading, error, refresh };
}
