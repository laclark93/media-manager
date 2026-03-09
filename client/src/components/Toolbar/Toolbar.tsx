import { useState } from 'react';
import { StalenessLevel, SortOption } from '../../types/common';
import './Toolbar.css';

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
      <div className="toolbar__sort">
        <label>Sort:</label>
        <select
          className="toolbar__select"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
        >
          <option value="title">Title</option>
          <option value="dateAdded">Date Added</option>
          <option value="lastAired">Last Aired</option>
          <option value="percentMissing">% Missing</option>
          <option value="numberMissing"># Missing</option>
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
