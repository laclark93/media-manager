import { useMemo } from 'react';
import { useRadarr } from '../hooks/useRadarr';
import { useSettings } from '../hooks/useSettings';
import { useFilter } from '../hooks/useFilter';
import { useActivityLog } from '../hooks/useActivityLog';
import { getStaleness } from '../utils/staleness';
import { getRadarrPosterUrl, getRadarrRemotePoster } from '../utils/images';
import { MediaCard } from '../components/MediaCard/MediaCard';
import { Toolbar, SortOptionDef } from '../components/Toolbar/Toolbar';

const MOVIE_SORT_OPTIONS: SortOptionDef[] = [
  { value: 'title', label: 'Title' },
  { value: 'dateAdded', label: 'Date Added' },
  { value: 'lastAired', label: 'Release Date' },
];

interface MovieItem {
  id: number;
  title: string;
  year: number;
  posterUrl: string;
  remotePosterUrl: string;
  dateAdded: string;
  lastAired?: string;
}

export function Movies() {
  const { movies, loading, error, searchMovie, refresh } = useRadarr();
  const { settings } = useSettings();
  const { addEntry, updateEntry } = useActivityLog();

  const thresholds = settings?.stalenessThresholds;
  const radarrUrl = settings?.radarrUrl || '';

  const items = useMemo<MovieItem[]>(() =>
    movies.map(m => ({
      id: m.id,
      title: m.title,
      year: m.year,
      posterUrl: getRadarrPosterUrl(m),
      remotePosterUrl: getRadarrRemotePoster(m),
      dateAdded: m.added,
      lastAired: m.physicalRelease || m.digitalRelease || m.inCinemas || `${m.year}-01-01`,
    })),
    [movies]
  );

  const { filtered, sortBy, setSortBy, sortDir, setSortDir, stalenessFilter, setStalenessFilter, searchQuery, setSearchQuery, totalCount, filteredCount } =
    useFilter(items, thresholds, 'movies');

  if (loading) return <div className="page"><div className="loading">Loading movies</div></div>;

  return (
    <div className="page">
      {error && <div className="error-banner">{error}</div>}
      <Toolbar
        sortBy={sortBy}
        sortDir={sortDir}
        stalenessFilter={stalenessFilter}
        onSortChange={setSortBy}
        onSortDirChange={setSortDir}
        onFilterChange={setStalenessFilter}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        totalCount={totalCount}
        filteredCount={filteredCount}
        onRefresh={refresh}
        onSearchAll={async () => {
          const eid = addEntry('Search All Movies', `${filtered.length} movies`);
          try {
            await Promise.all(filtered.map(m => searchMovie(m.id)));
            updateEntry(eid, 'success', `${filtered.length} movie(s) queued`);
          } catch { updateEntry(eid, 'error', 'Failed'); }
        }}
        searchAllLabel={`Search All (${filteredCount})`}
        sortOptions={MOVIE_SORT_OPTIONS}
      />
      {filtered.length === 0 ? (
        <div className="empty-state">
          <h2>No Missing Movies</h2>
          <p>All monitored movies have been downloaded.</p>
        </div>
      ) : (
        <div className="media-grid">
          {filtered.map(item => (
            <MediaCard
              key={item.id}
              id={item.id}
              title={item.title}
              year={item.year}
              posterUrl={item.posterUrl}
              remotePosterUrl={item.remotePosterUrl}
              dateAdded={item.dateAdded}
              showDateAdded={sortBy === 'dateAdded'}
              stalenessLevel={getStaleness(item.dateAdded, thresholds, item.lastAired)}
              type="movie"
              radarrUrl={radarrUrl}
              radarrMovieId={item.id}
              onSearch={async () => {
                const eid = addEntry('Search', item.title);
                try { await searchMovie(item.id); updateEntry(eid, 'success', 'Queued'); }
                catch { updateEntry(eid, 'error', 'Failed'); }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
