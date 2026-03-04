import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { fetchApi } from '../utils/api';

export interface LogEntry {
  id: number;
  timestamp: Date;
  action: string;
  target: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
}

interface ActivityLogContextValue {
  entries: LogEntry[];
  addEntry: (action: string, target: string) => number;
  updateEntry: (id: number, status: 'success' | 'error', message?: string) => void;
  clearEntries: () => void;
}

let nextId = 1;

export const ActivityLogContext = createContext<ActivityLogContextValue | null>(null);

function saveLog(entries: LogEntry[]) {
  const serialized = entries.map(e => ({ ...e, timestamp: e.timestamp.toISOString() }));
  fetchApi('/api/persistence/log', {
    method: 'PUT',
    body: JSON.stringify(serialized),
  }).catch(() => {});
}

export function useActivityLogState() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const isLoadedRef = useRef(false);

  useEffect(() => {
    fetchApi<{ id: number; timestamp: string; action: string; target: string; status: 'pending' | 'success' | 'error'; message?: string }[]>(
      '/api/persistence/log'
    )
      .then(data => {
        const parsed: LogEntry[] = data.map(e => ({ ...e, timestamp: new Date(e.timestamp) }));
        if (parsed.length > 0) {
          nextId = Math.max(...parsed.map(e => e.id)) + 1;
        }
        isLoadedRef.current = true;
        setEntries(parsed);
      })
      .catch(() => { isLoadedRef.current = true; });
  }, []);

  const addEntry = useCallback((action: string, target: string): number => {
    const id = nextId++;
    const entry: LogEntry = {
      id,
      timestamp: new Date(),
      action,
      target,
      status: 'pending',
    };
    setEntries(prev => {
      const next = [entry, ...prev].slice(0, 100);
      if (isLoadedRef.current) saveLog(next);
      return next;
    });
    return id;
  }, []);

  const updateEntry = useCallback((id: number, status: 'success' | 'error', message?: string) => {
    setEntries(prev => {
      const next = prev.map(e => e.id === id ? { ...e, status, message } : e);
      if (isLoadedRef.current) saveLog(next);
      return next;
    });
  }, []);

  const clearEntries = useCallback(() => {
    setEntries([]);
    if (isLoadedRef.current) saveLog([]);
  }, []);

  return { entries, addEntry, updateEntry, clearEntries };
}

export function useActivityLog() {
  const ctx = useContext(ActivityLogContext);
  if (!ctx) throw new Error('useActivityLog must be used within ActivityLogContext');
  return ctx;
}
