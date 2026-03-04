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

export function createCache<T>(): Cache<T> {
  let entry: CacheEntry<T> | null = null;
  return {
    get() { return entry; },
    set(data: T) { entry = { data, fetchedAt: Date.now() }; },
    isStale() { return !entry || Date.now() - entry.fetchedAt > REFRESH_INTERVAL; },
  };
}
