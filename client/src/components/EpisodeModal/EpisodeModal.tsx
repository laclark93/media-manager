import { useEffect, useState } from 'react';
import { SonarrEpisode } from '../../types/sonarr';
import './EpisodeModal.css';

interface EpisodeModalProps {
  seriesTitle: string;
  seriesId: number;
  dateAdded?: string;
  requestedBy?: string | null;
  getMissingEpisodes: (seriesId: number) => Promise<SonarrEpisode[]>;
  searchEpisodes: (episodeIds: number[]) => Promise<void>;
  searchSeries: (seriesId: number) => Promise<void>;
  onClose: () => void;
}

export function EpisodeModal({
  seriesTitle,
  seriesId,
  dateAdded,
  requestedBy,
  getMissingEpisodes,
  searchEpisodes,
  searchSeries,
  onClose,
}: EpisodeModalProps) {
  const [episodes, setEpisodes] = useState<SonarrEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchingIds, setSearchingIds] = useState<Set<number>>(new Set());
  const [searchAllState, setSearchAllState] = useState<'idle' | 'searching' | 'queued'>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getMissingEpisodes(seriesId);
        if (!cancelled) setEpisodes(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load episodes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [seriesId, getMissingEpisodes]);

  const handleSearch = async (episodeId: number) => {
    setSearchingIds(prev => new Set(prev).add(episodeId));
    try {
      await searchEpisodes([episodeId]);
    } finally {
      setTimeout(() => {
        setSearchingIds(prev => {
          const next = new Set(prev);
          next.delete(episodeId);
          return next;
        });
      }, 3000);
    }
  };

  const grouped = episodes.reduce<Record<number, SonarrEpisode[]>>((acc, ep) => {
    if (!acc[ep.seasonNumber]) acc[ep.seasonNumber] = [];
    acc[ep.seasonNumber].push(ep);
    return acc;
  }, {});

  const seasonNumbers = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div className="modal__header-left">
            <div className="modal__title">{seriesTitle} — Missing Episodes</div>
            {dateAdded && (
              <div className="modal__date-added">
                Added {new Date(dateAdded).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
            {requestedBy !== undefined && (
              <div className="modal__date-added">
                {requestedBy ? `Requested by ${requestedBy}` : 'Direct Request'}
              </div>
            )}
            <button
              className={`modal__search-all modal__search-all--${searchAllState}`}
              disabled={searchAllState !== 'idle' || loading || episodes.length === 0}
              onClick={async () => {
                setSearchAllState('searching');
                try {
                  await searchSeries(seriesId);
                  setSearchAllState('queued');
                  setTimeout(() => setSearchAllState('idle'), 3000);
                } catch {
                  setSearchAllState('idle');
                }
              }}
            >
              {searchAllState === 'searching' ? 'Searching...' : searchAllState === 'queued' ? 'Queued' : `Search All (${episodes.length})`}
            </button>
          </div>
          <button className="modal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal__body">
          {loading && <div className="loading">Loading episodes</div>}
          {error && <div className="error-banner">{error}</div>}
          {!loading && !error && episodes.length === 0 && (
            <div className="empty-state">
              <p>No missing episodes found.</p>
            </div>
          )}
          {seasonNumbers.map(season => (
            <div key={season} className="modal__season-group">
              <div className="modal__season-title">Season {season}</div>
              {grouped[season].map(ep => (
                <div key={ep.id} className="modal__episode">
                  <span className="modal__ep-number">
                    S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
                  </span>
                  <span className="modal__ep-title" title={ep.title}>{ep.title}</span>
                  <span className="modal__ep-date">
                    {ep.airDate ? new Date(ep.airDate).toLocaleDateString() : 'N/A'}
                  </span>
                  <button
                    className="modal__ep-search"
                    onClick={() => handleSearch(ep.id)}
                    disabled={searchingIds.has(ep.id)}
                  >
                    {searchingIds.has(ep.id) ? 'Queued' : 'Search'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
