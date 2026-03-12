import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchApi } from '../utils/api';

export interface HistorySnapshot {
  timestamp: string;
  shows: number;
  movies: number;
}

export function useHistory() {
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const recorded = useRef(false);

  useEffect(() => {
    fetchApi<HistorySnapshot[]>('/api/persistence/history')
      .then(setHistory)
      .catch(() => {});
  }, []);

  const record = useCallback(async (shows: number, movies: number) => {
    if (recorded.current) return;
    recorded.current = true;
    try {
      const updated = await fetchApi<HistorySnapshot[]>('/api/persistence/history', {
        method: 'POST',
        body: JSON.stringify({ shows, movies }),
      });
      setHistory(updated);
    } catch {
      // ignore
    }
  }, []);

  return { history, record };
}
