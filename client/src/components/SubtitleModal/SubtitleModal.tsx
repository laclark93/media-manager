import { useState, useEffect } from 'react';
import { SubtitleMissing, AffectedEpisode } from '../../types/anime';
import { fetchApi } from '../../utils/api';
import '../EpisodeModal/EpisodeModal.css';

interface SubtitleStream {
  language: string;
  languageCode: string;
  codec: string;
  forced: boolean;
  displayTitle?: string;
}

interface HistoryRecord {
  id: number;
  eventType: string;
  date: string;
  sourceTitle?: string;
  quality?: string;
}

type ActionState = 'idle' | 'loading' | 'done' | 'error';

interface SubtitleModalProps {
  item: SubtitleMissing;
  sonarrUrl?: string;
  radarrUrl?: string;
  plexConfigured?: boolean;
  onClose: () => void;
  onAllMarkedFailed?: () => void;
}

function PlexSubtitleBadge({ streams }: Readonly<{ streams: SubtitleStream[] | undefined }>) {
  if (!streams) return null;
  if (streams.length === 0) return (
    <span title="Plex detected no subtitle tracks" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
      Plex: none
    </span>
  );
  const hasEnglish = streams.some(s =>
    s.languageCode === 'eng' || s.language.toLowerCase() === 'english'
  );
  const labels = [...new Set(streams.map(s => s.displayTitle || s.language || s.codec || '?'))].join(', ');
  return (
    <span
      title={`Plex subtitle tracks: ${labels}`}
      style={{
        fontSize: '0.7rem',
        color: hasEnglish ? 'var(--success, #4caf50)' : 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      Plex: {hasEnglish ? '✓ Eng' : labels || 'no eng'}
    </span>
  );
}

function eventTypeLabel(eventType: string): string {
  switch (eventType) {
    case 'grabbed': return 'Grabbed';
    case 'downloadFolderImported': return 'Imported';
    case 'downloadFailed': return 'Failed';
    case 'episodeFileDeleted': return 'Deleted';
    case 'episodeFileRenamed': return 'Renamed';
    case 'downloadIgnored': return 'Ignored';
    default: return eventType;
  }
}

function eventTypeColor(eventType: string): string {
  switch (eventType) {
    case 'grabbed': return 'var(--accent, #3498db)';
    case 'downloadFolderImported': return 'var(--success, #4caf50)';
    case 'downloadFailed': return 'var(--danger, #e74c3c)';
    case 'episodeFileDeleted': return 'var(--danger, #e74c3c)';
    default: return 'var(--text-muted)';
  }
}

function formatHistoryDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function EpisodeRow({
  ep,
  seriesId,
  plexUrl,
  plexSubtitles,
  errMsg: parentErr,
  onDone,
}: {
  ep: AffectedEpisode;
  seriesId: number;
  plexUrl?: string;
  plexSubtitles?: SubtitleStream[];
  errMsg?: string;
  onDone: (fileId: number) => void;
}) {
  const [state, setState] = useState<ActionState>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  const handleToggleHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (history !== null || !ep.episodeId) return;
    setHistoryLoading(true);
    try {
      const records = await fetchApi<HistoryRecord[]>(`/api/sonarr/episode-history/${ep.episodeId}`);
      setHistory(records);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <>
      <div className="modal__episode" title={errMsg || parentErr || (ep.subtitles ? `Subs: ${ep.subtitles}` : undefined)}>
        <span className="modal__ep-number">{label}</span>
        <span className="modal__ep-title" title={ep.title || undefined}>{ep.title || ''}</span>
        <span className="modal__ep-date">{ep.subtitles || 'none'}</span>
        <PlexSubtitleBadge streams={plexSubtitles} />
        {ep.episodeId && (
          <button
            className="modal__ep-search"
            onClick={handleToggleHistory}
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            title="View episode history"
          >
            {showHistory ? 'Hide' : 'History'}
          </button>
        )}
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
          className={`modal__ep-search${state === 'done' ? ' modal__search-all--queued' : ' modal__ep-search--danger'}`}
          disabled={state === 'loading' || state === 'done'}
          onClick={handleMarkFailed}
          title={state === 'done' ? 'Marked as failed' : state === 'error' ? errMsg : 'Mark as failed and search for replacement'}
        >
          {state === 'loading' ? '...' : state === 'done' ? 'Queued' : state === 'error' ? 'Retry' : 'Mark As Failed'}
        </button>
      </div>
      {showHistory && (
        <div className="modal__history">
          {historyLoading && <div className="modal__history-loading">Loading history...</div>}
          {history !== null && history.length === 0 && !historyLoading && (
            <div className="modal__history-empty">No history found</div>
          )}
          {history && history.length > 0 && history.map(r => (
            <div key={r.id} className="modal__history-row">
              <span className="modal__history-type" style={{ color: eventTypeColor(r.eventType) }}>
                {eventTypeLabel(r.eventType)}
              </span>
              <span className="modal__history-date">{formatHistoryDate(r.date)}</span>
              {r.quality && <span className="modal__history-quality">{r.quality}</span>}
              {r.sourceTitle && (
                <span className="modal__history-source" title={r.sourceTitle}>{r.sourceTitle}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
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
        className={`modal__ep-search${state === 'done' ? ' modal__search-all--queued' : ' modal__ep-search--danger'}`}
        disabled={state === 'loading' || state === 'done'}
        onClick={handleMarkFailed}
      >
        {state === 'loading' ? '...' : state === 'done' ? 'Queued' : state === 'error' ? 'Retry' : 'Mark As Failed'}
      </button>
    </div>
  );
}

export function SubtitleModal({ item, sonarrUrl, radarrUrl, plexConfigured, onClose, onAllMarkedFailed }: SubtitleModalProps) {
  const [dismissedFileIds, setDismissedFileIds] = useState<Set<number>>(new Set());
  const [markAllState, setMarkAllState] = useState<ActionState>('idle');
  const [plexEpisodeUrls, setPlexEpisodeUrls] = useState<Record<string, string>>({});
  const [plexShowUrl, setPlexShowUrl] = useState<string | null>(null);
  const [plexLoading, setPlexLoading] = useState(false);
  const [plexSubtitleStreams, setPlexSubtitleStreams] = useState<Record<string, SubtitleStream[]>>({});
  const [plexMovieStreams, setPlexMovieStreams] = useState<SubtitleStream[] | undefined>(undefined);

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

  // Fetch Plex subtitle streams for affected episodes/movies
  useEffect(() => {
    if (!plexConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const plexType = item.service === 'sonarr' ? 'show' : 'movie';
        const params = new URLSearchParams({ title: item.title, type: plexType });
        if (item.year) params.set('year', String(item.year));
        if (item.service === 'sonarr' && item.affectedEpisodes && item.affectedEpisodes.length > 0) {
          const epKeys = item.affectedEpisodes
            .filter(ep => ep.seasonNumber != null && ep.episodeNumber != null)
            .map(ep => `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`);
          if (epKeys.length > 0) params.set('episodes', epKeys.join(','));
        }
        const result = await fetchApi<{ episodes?: Record<string, SubtitleStream[]>; movie?: SubtitleStream[] }>(
          `/api/plex/subtitle-streams?${params}`
        );
        if (!cancelled) {
          if (result.episodes) setPlexSubtitleStreams(result.episodes);
          if (result.movie) setPlexMovieStreams(result.movie);
        }
      } catch {
        // Plex subtitle lookup failed — non-fatal
      }
    })();
    return () => { cancelled = true; };
  }, [plexConfigured, item.title, item.year, item.service, item.affectedEpisodes]);

  const baseUrl = item.instanceUrl || (item.service === 'sonarr' ? sonarrUrl : radarrUrl) || '';
  const openUrl =
    item.slug && baseUrl
      ? item.service === 'sonarr'
        ? `${baseUrl}/series/${item.slug}`
        : `${baseUrl}/movie/${item.slug}`
      : null;

  const openServiceLabel = item.service === 'sonarr' ? 'Sonarr' : 'Radarr';

  const episodes = (item.affectedEpisodes ?? []).filter(ep => !dismissedFileIds.has(ep.fileId));
  const movieFileIds = (item.affectedFileIds ?? []).filter(id => !dismissedFileIds.has(id));

  // Auto-close when all items have been marked as failed
  useEffect(() => {
    if (dismissedFileIds.size > 0 && episodes.length === 0 && movieFileIds.length === 0) {
      onAllMarkedFailed?.();
      const t = setTimeout(onClose, 1000);
      return () => clearTimeout(t);
    }
  }, [dismissedFileIds.size, episodes.length, movieFileIds.length, onClose, onAllMarkedFailed]);

  const handleFileDone = (fileId: number) => {
    setDismissedFileIds(prev => {
      const next = new Set([...prev, fileId]);
      // Check if all items are now dismissed
      const allEpIds = (item.affectedEpisodes ?? []).map(ep => ep.fileId);
      const allMovieIds = item.affectedFileIds ?? [];
      const allDone = [...allEpIds, ...allMovieIds].every(id => next.has(id));
      if (allDone && next.size > 0) {
        // Schedule close — use setTimeout to allow state to settle
        setTimeout(() => {
          onAllMarkedFailed?.();
          onClose();
        }, 1000);
      }
      return next;
    });
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
      setDismissedFileIds(new Set((item.affectedEpisodes ?? []).map(ep => ep.fileId)));
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
                className={`modal__search-all${markAllState === 'done' ? ' modal__search-all--queued' : markAllState === 'loading' ? ' modal__search-all--searching' : ' modal__search-all--danger'}`}
                disabled={markAllState === 'loading' || markAllState === 'done'}
                onClick={handleMarkAll}
              >
                {markAllState === 'loading' ? 'Working...' : markAllState === 'done' ? 'All Queued' : `Mark All As Failed (${episodes.length})`}
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
                    plexUrl={epKey ? (plexEpisodeUrls[epKey] ?? plexShowUrl ?? undefined) : (plexShowUrl ?? undefined)}
                    plexSubtitles={epKey ? plexSubtitleStreams[epKey] : undefined}
                    onDone={handleFileDone}
                  />
                );
              })}
            </div>
          ))}

          {/* Radarr movie files */}
          {item.service === 'radarr' && plexMovieStreams !== undefined && (
            <div style={{ marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <PlexSubtitleBadge streams={plexMovieStreams} />
            </div>
          )}
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
