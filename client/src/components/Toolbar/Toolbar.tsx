import { useState, useRef, useEffect } from 'react';
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
  stalenessFilter: Set<StalenessLevel>;
  onSortChange: (sortBy: SortOption) => void;
  onSortDirChange: (dir: 'asc' | 'desc') => void;
  onFilterChange: (filter: Set<StalenessLevel>) => void;
  totalCount: number;
  filteredCount: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  onSearchAll?: () => Promise<void>;
  searchAllLabel?: string;
  sortOptions?: SortOptionDef[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  missingRange?: [number, number] | null;
  onMissingRangeChange?: (range: [number, number] | null) => void;
  maxMissing?: number;
  lastAiredRange?: [string, string] | null;
  onLastAiredRangeChange?: (range: [string, string] | null) => void;
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
  missingRange,
  onMissingRangeChange,
  maxMissing = 0,
  lastAiredRange,
  onLastAiredRangeChange,
}: ToolbarProps) {
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'queued'>('idle');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: Event) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [filterOpen]);

  const hasActiveRange = missingRange != null;
  const rangeMin = missingRange ? missingRange[0] : 0;
  const rangeMax = missingRange ? missingRange[1] : maxMissing;
  const hasActiveDateRange = lastAiredRange != null;
  const hasAnyFilter = stalenessFilter.size > 0 || hasActiveRange || hasActiveDateRange;
  const today = new Date().toISOString().slice(0, 10);

  const handleClearAll = () => {
    onFilterChange(new Set());
    if (onMissingRangeChange) onMissingRangeChange(null);
    if (onLastAiredRangeChange) onLastAiredRangeChange(null);
  };

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

      <div className="toolbar__actions">
        <div className="toolbar__filter-wrapper" ref={filterRef}>
          <button
            className={`toolbar__filter-btn${hasAnyFilter ? ' toolbar__filter-btn--active' : ''}${filterOpen ? ' toolbar__filter-btn--open' : ''}`}
            onClick={() => setFilterOpen(o => !o)}
            title="Filters"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {hasAnyFilter && <span className="toolbar__filter-dot" />}
          </button>
          {filterOpen && (
            <div className="toolbar__filter-popout">
              {hasAnyFilter && (
                <div className="toolbar__filter-clear-all">
                  <button className="toolbar__filter-clear" onClick={handleClearAll}>Clear All Filters</button>
                </div>
              )}
              <div className="toolbar__filter-section">
                <div className="toolbar__filter-section-header">
                  <span className="toolbar__filter-section-label">Staleness</span>
                  {stalenessFilter.size > 0 && (
                    <button
                      className="toolbar__filter-clear"
                      onClick={() => onFilterChange(new Set())}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="toolbar__filter-chips">
                  {STALENESS_OPTIONS.map((opt) => {
                    const isAll = opt.value === 'all';
                    const isActive = isAll ? stalenessFilter.size === 0 : stalenessFilter.has(opt.value as StalenessLevel);
                    return (
                      <button
                        key={opt.value}
                        className={`toolbar__chip${isActive ? ' toolbar__chip--active' : ''}`}
                        onClick={() => {
                          if (isAll) {
                            onFilterChange(new Set());
                          } else {
                            const level = opt.value as StalenessLevel;
                            const next = new Set(stalenessFilter);
                            if (next.has(level)) {
                              next.delete(level);
                            } else {
                              next.add(level);
                            }
                            onFilterChange(next);
                          }
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {onMissingRangeChange && maxMissing > 0 && (
                <div className="toolbar__filter-section">
                  <div className="toolbar__filter-section-header">
                    <span className="toolbar__filter-section-label">Missing Episodes</span>
                    {hasActiveRange && (
                      <button
                        className="toolbar__filter-clear"
                        onClick={() => onMissingRangeChange(null)}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="toolbar__range-inputs">
                    <label className="toolbar__range-field">
                      <span>Min</span>
                      <input
                        type="number"
                        min={0}
                        max={maxMissing}
                        value={rangeMin}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(Number(e.target.value) || 0, rangeMax));
                          onMissingRangeChange([v, rangeMax]);
                        }}
                        className="toolbar__number-input"
                      />
                    </label>
                    <span className="toolbar__range-dash">–</span>
                    <label className="toolbar__range-field">
                      <span>Max</span>
                      <input
                        type="number"
                        min={0}
                        max={maxMissing}
                        value={rangeMax}
                        onChange={(e) => {
                          const v = Math.min(maxMissing, Math.max(Number(e.target.value) || 0, rangeMin));
                          onMissingRangeChange([rangeMin, v]);
                        }}
                        className="toolbar__number-input"
                      />
                    </label>
                  </div>
                  <div className="toolbar__range-track">
                    <input
                      type="range"
                      min={0}
                      max={maxMissing}
                      value={rangeMin}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        onMissingRangeChange([Math.min(v, rangeMax), rangeMax]);
                      }}
                      className="toolbar__range-input toolbar__range-input--min"
                    />
                    <input
                      type="range"
                      min={0}
                      max={maxMissing}
                      value={rangeMax}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        onMissingRangeChange([rangeMin, Math.max(v, rangeMin)]);
                      }}
                      className="toolbar__range-input toolbar__range-input--max"
                    />
                  </div>
                </div>
              )}
              {onLastAiredRangeChange && (
                <div className="toolbar__filter-section">
                  <div className="toolbar__filter-section-header">
                    <span className="toolbar__filter-section-label">Last Aired</span>
                    {hasActiveDateRange && (
                      <button
                        className="toolbar__filter-clear"
                        onClick={() => onLastAiredRangeChange(null)}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="toolbar__date-inputs">
                    <label className="toolbar__range-field">
                      <span>From</span>
                      <input
                        type="date"
                        max={lastAiredRange?.[1] || today}
                        value={lastAiredRange?.[0] ?? ''}
                        onChange={(e) => {
                          const from = e.target.value;
                          const to = lastAiredRange?.[1] ?? today;
                          onLastAiredRangeChange(from || to ? [from, to] : null);
                        }}
                        className="toolbar__date-input"
                      />
                    </label>
                    <span className="toolbar__range-dash">–</span>
                    <label className="toolbar__range-field">
                      <span>To</span>
                      <input
                        type="date"
                        min={lastAiredRange?.[0] || ''}
                        max={today}
                        value={lastAiredRange?.[1] ?? today}
                        onChange={(e) => {
                          const to = e.target.value;
                          const from = lastAiredRange?.[0] ?? '';
                          onLastAiredRangeChange(from || to ? [from, to] : null);
                        }}
                        className={`toolbar__date-input${!lastAiredRange ? ' toolbar__date-input--placeholder' : ''}`}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
