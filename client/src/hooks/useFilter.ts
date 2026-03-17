import { useMemo, useState } from 'react';
import { StalenessLevel, SortOption, StalenessThresholds } from '../types/common';
import { getStaleness } from '../utils/staleness';

interface Filterable {
  title: string;
  dateAdded: string;
  lastAired?: string;
  oldestMissing?: string;
  episodeFileCount?: number;
  episodeCount?: number;
}

export function useFilter<T extends Filterable>(items: T[], thresholds?: StalenessThresholds, storageKey?: string) {
  const [sortBy, _setSortBy] = useState<SortOption>(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`${storageKey}.sortBy`);
      if (saved && ['title', 'dateAdded', 'lastAired', 'staleness', 'percentMissing', 'numberMissing'].includes(saved)) return saved as SortOption;
    }
    return 'dateAdded';
  });
  const [sortDir, _setSortDir] = useState<'asc' | 'desc'>(() => {
    if (storageKey) {
      const saved = localStorage.getItem(`${storageKey}.sortDir`);
      if (saved === 'asc' || saved === 'desc') return saved;
    }
    return 'asc';
  });
  const [stalenessFilter, setStalenessFilter] = useState<Set<StalenessLevel>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [missingRange, setMissingRange] = useState<[number, number] | null>(null);
  const [lastAiredRange, setLastAiredRange] = useState<[string, string] | null>(null);

  const setSortBy = (v: SortOption) => {
    _setSortBy(v);
    if (storageKey) localStorage.setItem(`${storageKey}.sortBy`, v);
  };
  const setSortDir = (v: 'asc' | 'desc') => {
    _setSortDir(v);
    if (storageKey) localStorage.setItem(`${storageKey}.sortDir`, v);
  };

  const filtered = useMemo(() => {
    let result = [...items];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => item.title.toLowerCase().includes(q));
    }

    if (stalenessFilter.size > 0) {
      result = result.filter(item => stalenessFilter.has(getStaleness(item.dateAdded, thresholds, item.oldestMissing || item.lastAired)));
    }

    if (missingRange) {
      const [min, max] = missingRange;
      result = result.filter(item => {
        const missing = (item.episodeCount || 0) - (item.episodeFileCount || 0);
        return missing >= min && missing <= max;
      });
    }

    if (lastAiredRange) {
      const [from, to] = lastAiredRange;
      const fromTime = from ? new Date(from).getTime() : -Infinity;
      const toTime = to ? new Date(to + 'T23:59:59').getTime() : Infinity;
      result = result.filter(item => {
        if (!item.lastAired) return false;
        const t = new Date(item.lastAired).getTime();
        return t >= fromTime && t <= toTime;
      });
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'dateAdded':
          cmp = new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
          break;
        case 'lastAired': {
          const aTime = a.lastAired ? new Date(a.lastAired).getTime() : 0;
          const bTime = b.lastAired ? new Date(b.lastAired).getTime() : 0;
          cmp = aTime - bTime;
          break;
        }
        case 'percentMissing': {
          const aPct = a.episodeCount && a.episodeCount > 0
            ? ((a.episodeCount - (a.episodeFileCount || 0)) / a.episodeCount)
            : 0;
          const bPct = b.episodeCount && b.episodeCount > 0
            ? ((b.episodeCount - (b.episodeFileCount || 0)) / b.episodeCount)
            : 0;
          cmp = aPct - bPct;
          break;
        }
        case 'numberMissing': {
          const aMissing = (a.episodeCount || 0) - (a.episodeFileCount || 0);
          const bMissing = (b.episodeCount || 0) - (b.episodeFileCount || 0);
          cmp = aMissing - bMissing;
          break;
        }
        case 'staleness': {
          const refDate = (item: T) => {
            const added = item.dateAdded ? new Date(item.dateAdded).getTime() : 0;
            const release = (item.oldestMissing || item.lastAired) ? new Date((item.oldestMissing || item.lastAired)!).getTime() : 0;
            return Math.max(added || 0, release || 0) || Date.now();
          };
          // Older reference date = more stale = higher value
          cmp = refDate(a) - refDate(b);
          break;
        }
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [items, sortBy, sortDir, stalenessFilter, searchQuery, missingRange, lastAiredRange, thresholds]);

  const maxMissing = useMemo(() => {
    let max = 0;
    for (const item of items) {
      const missing = (item.episodeCount || 0) - (item.episodeFileCount || 0);
      if (missing > max) max = missing;
    }
    return max;
  }, [items]);

  return {
    filtered,
    sortBy, setSortBy,
    sortDir, setSortDir,
    stalenessFilter, setStalenessFilter,
    searchQuery, setSearchQuery,
    missingRange, setMissingRange,
    lastAiredRange, setLastAiredRange,
    maxMissing,
    totalCount: items.length,
    filteredCount: filtered.length,
  };
}
