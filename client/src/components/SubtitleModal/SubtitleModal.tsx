import { useState, useEffect } from 'react';
import { SubtitleMissing, AffectedEpisode } from '../../types/anime';
import { fetchApi } from '../../utils/api';
import '../EpisodeModal/EpisodeModal.css';

type ActionState = 'idle' | 'loading' | 'done' | 'error';

interface SubtitleModalProps {
  item: SubtitleMissing;
  sonarrUrl?: string;
  radarrUrl?: string;
  plexConfigured?: boolean;
  onClose: () => void;
}

function EpisodeRow({
  ep,
  seriesId,
  plexUrl,
  errMsg: parentErr,
  onDone,
}: {
  ep: AffectedEpisode;
  seriesId: number;
  plexUrl?: string;
  errMsg?: string;
  onDone: (fileId: number) => void;
}) {
  const [state, setState] = useState<ActionState>('idle');
  const [errMsg, setErrMsg] = useState('');

  const label =
    ep.seasonNumber != null && ep.episodeNumber != null
      ? `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`
      : `File ${ep.fileId}`;

  const handleMarkFailed = async () => {
    setState('loading');
    setErrMsg('');
    try {
      await fetchApi('/api/sonarr/mark-failed', {
        method: 'POST',
        body: JSON.stringify({ seriesId, episodeFileId: ep.fileId, episodeId: ep.episodeId }),
      });
      setState('done');
      onDone(ep.fileId);
    } catch (err) {
      setState('error');
      setErrMsg(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="modal__episode" title={errMsg || parentErr || (ep.subtitles ? `Subs: ${ep.subtitles}` : undefined)}>
      <span className="modal__ep-number">{label}</span>
      <span className="modal__ep-title" title={ep.title || undefined}>{ep.title || ''}</span>
      <span className="modal__ep-date">{ep.subtitles || 'none'}</span>
      {plexUrl && (
        <a
          className="modal__ep-search"
          href={plexUrl}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: 'none', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        >
          Plex
        </a>
      )}
      <button
        className={`modal__ep-search${state === 'done' ? ' modal__search-all--queued' : ''}`}
        disabled={state === 'loading' || state === 'done'}
        onClick={handleMarkFailed}
        title={state === 'done' ? 'Marked as failed' : state === 'error' ? errMsg : 'Mark as failed and search for replacement'}
      >
        {state === 'loading' ? '...' : state === 'done' ? 'Queued' : state === 'error' ? 'Retry' : 'Mark Failed'}
      </button>
    </div>
  );
}

function MovieFileRow({
  fileId,
  movieId,
  onDone,
}: {
  fileId: number;
  movieId: number;
  onDone: (fileId: number) => void;
}) {
  const [state, setState] = useState<ActionState>('idle');
  const [errMsg, setErrMsg] = useState('');

  const handleMarkFailed = async () => {
    setState('loading');
    setErrMsg('');
    try {
      await fetchApi('/api/radarr/mark-failed', {
        method: 'POST',
        body: JSON.stringify({ movieId, movieFileId: fileId }),
      });
      setState('done');
      onDone(fileId);
    } catch (err) {
      setState('error');
      setErrMsg(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="modal__episode" title={errMsg || undefined}>
      <span className="modal__ep-number">Movie</span>
      <span className="modal__ep-title">Movie File</span>
      <span className="modal__ep-date" />
      <button
        className={`modal__ep-search${state === 'done' ? ' modal__search-all--queued' : ''}`}
        disabled={state === 'loading' || state === 'done'}
        onClick={handleMarkFailed}
      >
        {state === 'loading' ? '...' : state === 'done' ? 'Queued' : state === 'error' ? 'Retry' : 'Mark Failed'}
      </button>
    </div>
  );
}

export function SubtitleModal({ item, sonarrUrl, radarrUrl, plexConfigured, onClose }: SubtitleModalProps) {
  const [dismissedFileIds, setDismissedFileIds] = useState<Set<number>>(new Set());
  const [markAllState, setMarkAllState] = useState<ActionState>('idle');
  const [plexEpisodeUrls, setPlexEpisodeUrls] = useState<Record<string, string>>({});
  const [plexShowUrl, setPlexShowUrl] = useState<string | null>(null);
  const [plexLoading, setPlexLoading] = useState(false);

  // Fetch Plex episode URLs on mount
  useEffect(() => {
    if (!plexConfigured) return;
    let cancelled = false;
    (async () => {
      setPlexLoading(true);
      try {
        const plexType = item.service === 'sonarr' ? 'show' : 'movie';
        const params = new URLSearchParams({ title: item.title, type: plexType });
        if (item.year) params.set('year', String(item.year));
        const result = await fetchApi<{ showUrl: string | null; episodes: Record<string, string> }>(
          `/api/plex/episode-urls?${params}`
        );
        if (!cancelled) {
          setPlexShowUrl(result.showUrl);
          setPlexEpisodeUrls(result.episodes);
        }
      } catch {
        // Plex lookup failed — don't block the modal
      } finally {
        if (!cancelled) setPlexLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [plexConfigured, item.title, item.year, item.service]);

  const openUrl =
    item.slug && item.service === 'sonarr' && sonarrUrl
      ? `${sonarrUrl}/series/${item.slug}`
      : item.slug && item.service === 'radarr' && radarrUrl
        ? `${radarrUrl}/movie/${item.slug}`
        : null;

  const openServiceLabel = item.service === 'sonarr' ? 'Sonarr' : 'Radarr';

  const episodes = (item.affectedEpisodes ?? []).filter(ep => !dismissedFileIds.has(ep.fileId));
  const movieFileIds = (item.affectedFileIds ?? []).filter(id => !dismissedFileIds.has(id));

  const handleFileDone = (fileId: number) => {
    setDismissedFileIds(prev => new Set([...prev, fileId]));
  };

  const handleMarkAll = async () => {
    if (item.service !== 'sonarr' || episodes.length === 0) return;
    setMarkAllState('loading');
    try {
      await Promise.all(
        episodes.map(ep =>
          fetchApi('/api/sonarr/mark-failed', {
            method: 'POST',
            body: JSON.stringify({ seriesId: item.id, episodeFileId: ep.fileId, episodeId: ep.episodeId }),
          })
        )
      );
      setDismissedFileIds(new Set(episodes.map(ep => ep.fileId)));
      setMarkAllState('done');
    } catch {
      setMarkAllState('error');
    }
  };

  // Group episodes by season
  const grouped = episodes.reduce<Record<number, AffectedEpisode[]>>((acc, ep) => {
    const season = ep.seasonNumber ?? 0;
    if (!acc[season]) acc[season] = [];
    acc[season].push(ep);
    return acc;
  }, {});
  const seasonNumbers = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div className="modal__header-left">
            <div className="modal__title">{item.title} — Missing Eng Subs</div>
            {item.service === 'sonarr' && episodes.length > 1 && (
              <button
                className={`modal__search-all modal__search-all--${markAllState === 'done' ? 'queued' : markAllState === 'loading' ? 'searching' : 'idle'}`}
                disabled={markAllState === 'loading' || markAllState === 'done'}
                onClick={handleMarkAll}
              >
                {markAllState === 'loading' ? 'Working...' : markAllState === 'done' ? 'All Queued' : `Mark All Failed (${episodes.length})`}
              </button>
            )}
          </div>
          <button className="modal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal__body">
          {/* Links row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '0.8rem', padding: '4px 12px', borderRadius: 4,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', textDecoration: 'none',
                }}
              >
                Open in {openServiceLabel} ↗
              </a>
            )}
            {plexShowUrl && (
              <a
                href={plexShowUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '0.8rem', padding: '4px 12px', borderRadius: 4,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', textDecoration: 'none',
                }}
              >
                Open in Plex ↗
              </a>
            )}
            {plexConfigured && plexLoading && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Loading Plex links...</span>
            )}
          </div>

          {/* Sonarr episodes grouped by season */}
          {item.service === 'sonarr' && seasonNumbers.map(season => (
            <div key={season} className="modal__season-group">
              <div className="modal__season-title">Season {season}</div>
              {grouped[season].map(ep => {
                const epKey = ep.seasonNumber != null && ep.episodeNumber != null
                  ? `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`
                  : null;
                return (
                  <EpisodeRow
                    key={ep.fileId}
                    ep={ep}
                    seriesId={item.id}
                    plexUrl={epKey ? plexEpisodeUrls[epKey] : undefined}
                    onDone={handleFileDone}
                  />
                );
              })}
            </div>
          ))}

          {/* Radarr movie files */}
          {item.service === 'radarr' && movieFileIds.map(fileId => (
            <MovieFileRow key={fileId} fileId={fileId} movieId={item.id} onDone={handleFileDone} />
          ))}

          {/* All done */}
          {episodes.length === 0 && movieFileIds.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
              All files queued for replacement.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
