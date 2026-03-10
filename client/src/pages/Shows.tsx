import { useState, useMemo } from 'react';
import { useSonarr } from '../hooks/useSonarr';
import { useSettings } from '../hooks/useSettings';
import { useFilter } from '../hooks/useFilter';
import { useActivityLog } from '../hooks/useActivityLog';
import { useSearchQueue } from '../hooks/useSearchQueue';
import { getStaleness } from '../utils/staleness';
import { getSonarrPosterUrl, getSonarrRemotePoster } from '../utils/images';
import { MediaCard } from '../components/MediaCard/MediaCard';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { EpisodeModal } from '../components/EpisodeModal/EpisodeModal';
import { MissingTimeline } from '../components/MissingTimeline/MissingTimeline';

type ShowsTab = 'cards' | 'timeline';

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
  const { series, loading, error, searchSeries, searchEpisodes, getMissingEpisodes, getMissingTimeline, refresh } = useSonarr();
  const { settings } = useSettings();
  const { addEntry, updateEntry } = useActivityLog();
  const { startSearch } = useSearchQueue();
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ShowsTab>('cards');

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
      lastAired: s.latestMissingAirDate || s.previousAiring,
      episodeFileCount: s.statistics.episodeFileCount,
      episodeCount: s.statistics.episodeCount,
      titleSlug: s.titleSlug,
    })),
    [series]
  );

  const { filtered, sortBy, setSortBy, sortDir, setSortDir, stalenessFilter, setStalenessFilter, searchQuery, setSearchQuery, missingRange, setMissingRange, lastAiredRange, setLastAiredRange, maxMissing, totalCount, filteredCount } =
    useFilter(items, thresholds, 'shows');

  const selectedSeries = series.find(s => s.id === selectedSeriesId);

  if (loading) return <div className="page"><div className="loading">Loading shows</div></div>;

  return (
    <div className="page">
      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
        {(['cards', 'timeline'] as ShowsTab[]).map((tab, i, arr) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px',
              background: activeTab === tab ? 'var(--accent)' : 'var(--bg-card)',
              color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
              border: activeTab === tab ? '1px solid var(--accent)' : '1px solid var(--border)',
              borderLeft: i > 0 ? 'none' : undefined,
              borderRadius: i === 0 ? '6px 0 0 6px' : i === arr.length - 1 ? '0 6px 6px 0' : '0',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
              fontSize: '0.85rem',
              outline: 'none',
            }}
          >
            {tab === 'cards' ? 'Cards' : 'Timeline'}
          </button>
        ))}
      </div>

      {activeTab === 'cards' && (
        <>
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
              const eid = addEntry('Search All Shows', `${filtered.length} shows`);
              startSearch(
                filtered.map((s: ShowItem) => ({ id: s.id, title: s.title, type: 'show' as const })),
                searchSeries,
                eid,
                (count: number) => updateEntry(eid, 'success', `${count} show(s) queued`),
                () => updateEntry(eid, 'error', 'Failed'),
              );
            }}
            searchAllLabel={`Search All (${filteredCount})`}
            missingRange={missingRange}
            onMissingRangeChange={setMissingRange}
            maxMissing={maxMissing}
            lastAiredRange={lastAiredRange}
            onLastAiredRangeChange={setLastAiredRange}
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
                  stalenessLevel={getStaleness(item.dateAdded, thresholds, item.lastAired)}
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
        </>
      )}

      {activeTab === 'timeline' && (
        <MissingTimeline getMissingTimeline={getMissingTimeline} />
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
