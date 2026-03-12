export const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export interface Cache<T> {
  get(): CacheEntry<T> | null;
  set(data: T): void;
  isStale(): boolean;
}

function loadFromStorage<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (parsed?.data != null) {
      // Mark as stale (fetchedAt = 0) so a background refresh triggers immediately
      return { data: parsed.data, fetchedAt: 0 };
    }
  } catch { /* ignore corrupt data */ }
  return null;
}

export function createCache<T>(storageKey?: string): Cache<T> {
  let entry: CacheEntry<T> | null = storageKey ? loadFromStorage<T>(storageKey) : null;
  return {
    get() { return entry; },
    set(data: T) {
      entry = { data, fetchedAt: Date.now() };
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(entry)); }
        catch { /* quota exceeded — ignore */ }
      }
    },
    isStale() { return !entry || Date.now() - entry.fetchedAt > REFRESH_INTERVAL; },
  };
}
