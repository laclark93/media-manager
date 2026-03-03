import { createContext, useContext, useState, useCallback } from 'react';

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

export function useActivityLogState() {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  const addEntry = useCallback((action: string, target: string): number => {
    const id = nextId++;
    const entry: LogEntry = {
      id,
      timestamp: new Date(),
      action,
      target,
      status: 'pending',
    };
    setEntries(prev => [entry, ...prev].slice(0, 100));
    return id;
  }, []);

  const updateEntry = useCallback((id: number, status: 'success' | 'error', message?: string) => {
    setEntries(prev =>
      prev.map(e => e.id === id ? { ...e, status, message } : e)
    );
  }, []);

  const clearEntries = useCallback(() => {
    setEntries([]);
  }, []);

  return { entries, addEntry, updateEntry, clearEntries };
}

export function useActivityLog() {
  const ctx = useContext(ActivityLogContext);
  if (!ctx) throw new Error('useActivityLog must be used within ActivityLogContext');
  return ctx;
}
