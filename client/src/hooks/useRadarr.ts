import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { RadarrMovie } from '../types/radarr';

export function useRadarr() {
  const [movies, setMovies] = useState<RadarrMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<RadarrMovie[]>('/api/radarr/movies');
      setMovies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch movies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const searchMovie = useCallback(async (movieId: number) => {
    await fetchApi('/api/radarr/search', {
      method: 'POST',
      body: JSON.stringify({ movieId }),
    });
  }, []);

  return { movies, loading, error, refresh, searchMovie };
}
