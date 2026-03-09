import { useState } from 'react';
import { StalenessLevel, SortOption } from '../../types/common';
import './Toolbar.css';

export interface SortOptionDef {
  value: SortOption;
  label: string;
}

export const DEFAULT_SORT_OPTIONS: SortOptionDef[] = [
  { value: 'title', label: 'Title' },
  { value: 'dateAdded', label: 'Date Added' },
  { value: 'lastAired', label: 'Last Aired' },
  { value: 'percentMissing', label: '% Missing' },
  { value: 'numberMissing', label: '# Missing' },
];

interface ToolbarProps {
  sortBy: SortOption;
  sortDir: 'asc' | 'desc';
  stalenessFilter: StalenessLevel | 'all';
  onSortChange: (sortBy: SortOption) => void;
  onSortDirChange: (dir: 'asc' | 'desc') => void;
  onFilterChange: (filter: StalenessLevel | 'all') => void;
  totalCount: number;
  filteredCount: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  onSearchAll?: () => Promise<void>;
  searchAllLabel?: string;
  sortOptions?: SortOptionDef[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
}

const STALENESS_OPTIONS: { value: StalenessLevel | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: StalenessLevel.Fresh, label: 'Fresh' },
  { value: StalenessLevel.Stale, label: 'Stale' },
  { value: StalenessLevel.VeryStale, label: 'Very Stale' },
  { value: StalenessLevel.Ancient, label: 'Ancient' },
];

export function Toolbar({
  sortBy,
  sortDir,
  stalenessFilter,
  onSortChange,
  onSortDirChange,
  onFilterChange,
  totalCount,
  filteredCount,
  onRefresh,
  refreshing,
  onSearchAll,
  searchAllLabel,
  sortOptions = DEFAULT_SORT_OPTIONS,
  searchQuery,
  onSearchQueryChange,
}: ToolbarProps) {
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'queued'>('idle');

  const handleSearchAll = async () => {
    if (!onSearchAll || searchState !== 'idle') return;
    setSearchState('searching');
    try {
      await onSearchAll();
      setSearchState('queued');
      setTimeout(() => setSearchState('idle'), 3000);
    } catch {
      setSearchState('idle');
    }
  };

  return (
    <div className="toolbar">
      {onSearchQueryChange !== undefined && (
        <div className="toolbar__search">
          <input
            className="toolbar__search-input"
            type="text"
            placeholder="Search..."
            value={searchQuery ?? ''}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
        </div>
      )}
      <div className="toolbar__sort">
        <label>Sort:</label>
        <select
          className="toolbar__select"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
        >
          {sortOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          className="toolbar__dir-btn"
          onClick={() => onSortDirChange(sortDir === 'asc' ? 'desc' : 'asc')}
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
        >
          {sortDir === 'asc' ? '\u2191' : '\u2193'}
        </button>
      </div>

      <div className="toolbar__filters">
        {STALENESS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`toolbar__chip${stalenessFilter === opt.value ? ' toolbar__chip--active' : ''}`}
            onClick={() => onFilterChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
        <span className="toolbar__count">
          {filteredCount === totalCount ? totalCount : `${filteredCount} / ${totalCount}`}
        </span>
        {onSearchAll && (
          <button
            className={`toolbar__search-all-btn${searchState === 'queued' ? ' toolbar__search-all-btn--queued' : ''}`}
            onClick={handleSearchAll}
            disabled={searchState !== 'idle' || filteredCount === 0}
            title={searchAllLabel || 'Search All'}
          >
            {searchState === 'searching' ? 'Searching...' : searchState === 'queued' ? 'Queued' : (searchAllLabel || `Search All (${filteredCount})`)}
          </button>
        )}
        {onRefresh && (
          <button
            className="toolbar__refresh-btn"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh"
          >
            {refreshing ? '…' : '↺'}
          </button>
        )}
      </div>
    </div>
  );
}
