import { useMemo, useState } from 'react';
import { StalenessLevel, SortOption, StalenessThresholds } from '../types/common';
import { getStaleness } from '../utils/staleness';

interface Filterable {
  title: string;
  dateAdded: string;
  lastAired?: string;
  episodeFileCount?: number;
  episodeCount?: number;
}

export function useFilter<T extends Filterable>(items: T[], thresholds?: StalenessThresholds) {
  const [sortBy, setSortBy] = useState<SortOption>('dateAdded');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [stalenessFilter, setStalenessFilter] = useState<StalenessLevel | 'all'>('all');

  const filtered = useMemo(() => {
    let result = [...items];

    if (stalenessFilter !== 'all') {
      result = result.filter(item => getStaleness(item.dateAdded, thresholds) === stalenessFilter);
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
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [items, sortBy, sortDir, stalenessFilter, thresholds]);

  return {
    filtered,
    sortBy, setSortBy,
    sortDir, setSortDir,
    stalenessFilter, setStalenessFilter,
    totalCount: items.length,
    filteredCount: filtered.length,
  };
}
