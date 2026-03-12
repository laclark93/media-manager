import { createContext, useContext, useCallback, useSyncExternalStore } from 'react';

interface BackgroundLoadingStore {
  subscribe(cb: () => void): () => void;
  getSnapshot(): boolean;
  set(key: string, loading: boolean): void;
}

export function createBackgroundLoadingStore(): BackgroundLoadingStore {
  const keys = new Map<string, boolean>();
  const listeners = new Set<() => void>();
  let snapshot = false;

  function notify() {
    const next = [...keys.values()].some(Boolean);
    if (next !== snapshot) {
      snapshot = next;
      listeners.forEach(cb => cb());
    }
  }

  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot() {
      return snapshot;
    },
    set(key, loading) {
      keys.set(key, loading);
      notify();
    },
  };
}

export const BackgroundLoadingContext = createContext<BackgroundLoadingStore | null>(null);

export function useBackgroundLoading(): boolean {
  const store = useContext(BackgroundLoadingContext);
  return useSyncExternalStore(
    store ? store.subscribe : () => () => {},
    store ? store.getSnapshot : () => false,
  );
}

export function useSetBackgroundLoading(key: string) {
  const store = useContext(BackgroundLoadingContext);
  return useCallback((loading: boolean) => {
    store?.set(key, loading);
  }, [store, key]);
}
