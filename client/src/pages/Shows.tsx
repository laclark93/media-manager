import { useState, useMemo } from 'react';
import { useSonarr } from '../hooks/useSonarr';
import { useSettings } from '../hooks/useSettings';
import { useFilter } from '../hooks/useFilter';
import { useActivityLog } from '../hooks/useActivityLog';
import { getStaleness } from '../utils/staleness';
import { getSonarrPosterUrl, getSonarrRemotePoster } from '../utils/images';
import { MediaCard } from '../components/MediaCard/MediaCard';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { EpisodeModal } from '../components/EpisodeModal/EpisodeModal';

interface ShowItem {
  id: number;
  title: string;
  year: number;
  posterUrl: string;
  remotePosterUrl: string;
  dateAdded: string;
  lastAired?: string;
  episodeFileCount: number;
  episodeCount: number;
  titleSlug: string;
}

export function Shows() {
  const { series, loading, error, searchSeries, searchEpisodes, getMissingEpisodes, refresh } = useSonarr();
  const { settings } = useSettings();
  const { addEntry, updateEntry } = useActivityLog();
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null);

  const thresholds = settings?.stalenessThresholds;
  const sonarrUrl = settings?.sonarrUrl || '';

  const items = useMemo<ShowItem[]>(() =>
    series.map(s => ({
      id: s.id,
      title: s.title,
      year: s.year,
      posterUrl: getSonarrPosterUrl(s),
      remotePosterUrl: getSonarrRemotePoster(s),
      dateAdded: s.dateAdded,
      lastAired: s.previousAiring,
      episodeFileCount: s.statistics.episodeFileCount,
      episodeCount: s.statistics.episodeCount,
      titleSlug: s.titleSlug,
    })),
    [series]
  );

  const { filtered, sortBy, setSortBy, sortDir, setSortDir, stalenessFilter, setStalenessFilter, totalCount, filteredCount } =
    useFilter(items, thresholds);

  const selectedSeries = series.find(s => s.id === selectedSeriesId);

  if (loading) return <div className="page"><div className="loading">Loading shows</div></div>;

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
        totalCount={totalCount}
        filteredCount={filteredCount}
        onRefresh={refresh}
      />
      {filtered.length === 0 ? (
        <div className="empty-state">
          <h2>No Missing Shows</h2>
          <p>All monitored episodes have been downloaded.</p>
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
              stalenessLevel={getStaleness(item.dateAdded, thresholds)}
              type="show"
              episodeFileCount={item.episodeFileCount}
              episodeCount={item.episodeCount}
              sonarrUrl={sonarrUrl}
              sonarrSeriesSlug={item.titleSlug}
              onCardClick={() => setSelectedSeriesId(item.id)}
              onSearchAll={async () => {
                const eid = addEntry('Search All', item.title);
                try { await searchSeries(item.id); updateEntry(eid, 'success', 'Queued'); }
                catch { updateEntry(eid, 'error', 'Failed'); }
              }}
            />
          ))}
        </div>
      )}
      {selectedSeriesId !== null && selectedSeries && (
        <EpisodeModal
          seriesTitle={selectedSeries.title}
          seriesId={selectedSeriesId}
          getMissingEpisodes={getMissingEpisodes}
          searchEpisodes={async (episodeIds) => {
            const eid = addEntry('Search Episodes', selectedSeries.title);
            try { await searchEpisodes(episodeIds); updateEntry(eid, 'success', `${episodeIds.length} ep(s) queued`); }
            catch { updateEntry(eid, 'error', 'Failed'); }
          }}
          searchSeries={async (seriesId) => {
            const eid = addEntry('Search All', selectedSeries.title);
            try { await searchSeries(seriesId); updateEntry(eid, 'success', 'Queued'); }
            catch { updateEntry(eid, 'error', 'Failed'); }
          }}
          onClose={() => setSelectedSeriesId(null)}
        />
      )}
    </div>
  );
}
