import { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface SearchQueueItem {
  id: number;
  title: string;
  type: 'show' | 'movie';
  instanceUrl?: string;
}

export interface SearchQueueState {
  running: boolean;
  total: number;
  completed: number;
  type: 'show' | 'movie' | null;
}

interface SearchQueueContextValue {
  state: SearchQueueState;
  startSearch: (
    items: SearchQueueItem[],
    searchFn: (id: number, instanceUrl?: string) => Promise<void>,
    logEntryId: number,
    onDone: (count: number) => void,
    onError: () => void,
  ) => void;
}

const initialState: SearchQueueState = { running: false, total: 0, completed: 0, type: null };

export const SearchQueueContext = createContext<SearchQueueContextValue | null>(null);

export function useSearchQueueState(): SearchQueueContextValue {
  const [state, setState] = useState<SearchQueueState>(initialState);
  const cancelRef = useRef(false);

  const startSearch = useCallback(
    (
      items: SearchQueueItem[],
      searchFn: (id: number, instanceUrl?: string) => Promise<void>,
      _logEntryId: number,
      onDone: (count: number) => void,
      onError: () => void,
    ) => {
      if (items.length === 0) return;
      cancelRef.current = false;
      setState({ running: true, total: items.length, completed: 0, type: items[0].type });

      (async () => {
        let completed = 0;
        try {
          for (const item of items) {
            if (cancelRef.current) break;
            await searchFn(item.id, item.instanceUrl);
            completed++;
            setState(prev => ({ ...prev, completed }));
          }
          onDone(completed);
        } catch {
          onError();
        } finally {
          setState(initialState);
        }
      })();
    },
    [],
  );

  return { state, startSearch };
}

export function useSearchQueue() {
  const ctx = useContext(SearchQueueContext);
  if (!ctx) throw new Error('useSearchQueue must be used within SearchQueueContext');
  return ctx;
}
