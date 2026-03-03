import { useState, useEffect, useRef } from 'react';
import { SubtitleMissing, AffectedEpisode } from '../../types/anime';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import { fetchApi } from '../../utils/api';
import '../AnimeMismatchCard/AnimeMismatchCard.css';

const UNDO_SECONDS = 5;

interface SubtitleMissingCardProps {
  item: SubtitleMissing;
  sonarrUrl?: string;
  radarrUrl?: string;
  onIgnore?: () => void;
}

type ActionState = 'idle' | 'loading' | 'done' | 'error';

function EpisodeRow({ ep, seriesId, onDone }: { ep: AffectedEpisode; seriesId: number; onDone: (fileId: number) => void }) {
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
    <div className="amcard__episode-item" title={errMsg || (ep.subtitles ? `Subs: ${ep.subtitles}` : undefined)}>
      <div className="amcard__episode-meta">
        <div className="amcard__episode-id">{label}</div>
        {ep.title && <div className="amcard__episode-title">{ep.title}</div>}
      </div>
      <button
        className={`amcard__btn--retry${state === 'done' ? ' amcard__btn--retry--done' : ''}`}
        disabled={state === 'loading' || state === 'done'}
        onClick={handleMarkFailed}
        title={state === 'done' ? 'Marked as failed — searching for replacement' : state === 'error' ? errMsg : 'Mark as failed, add to blocklist, and search for replacement'}
      >
        {state === 'loading' ? '...' : state === 'done' ? '✓ Queued' : state === 'error' ? '✗ Retry' : 'Mark Failed'}
      </button>
    </div>
  );
}

function MovieFileRow({ fileId, movieId, onDone }: { fileId: number; movieId: number; onDone: (fileId: number) => void }) {
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
    <div className="amcard__episode-item" title={errMsg || undefined}>
      <div className="amcard__episode-meta">
        <div className="amcard__episode-id">Movie File</div>
      </div>
      <button
        className={`amcard__btn--retry${state === 'done' ? ' amcard__btn--retry--done' : ''}`}
        disabled={state === 'loading' || state === 'done'}
        onClick={handleMarkFailed}
        title={state === 'done' ? 'Marked as failed — searching for replacement' : state === 'error' ? errMsg : 'Mark as failed, add to blocklist, and search for replacement'}
      >
        {state === 'loading' ? '...' : state === 'done' ? '✓ Queued' : state === 'error' ? '✗ Retry' : 'Mark Failed'}
      </button>
    </div>
  );
}

export function SubtitleMissingCard({ item, sonarrUrl, radarrUrl, onIgnore }: SubtitleMissingCardProps) {
  const [imgSrc, setImgSrc] = useState(item.remotePosterUrl || item.posterUrl || '');
  const [imgFailed, setImgFailed] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [dismissedFileIds, setDismissedFileIds] = useState<Set<number>>(new Set());
  const [markAllState, setMarkAllState] = useState<ActionState>('idle');
  const [pendingIgnore, setPendingIgnore] = useState(false);
  const [countdown, setCountdown] = useState(UNDO_SECONDS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startIgnore = () => {
    setPendingIgnore(true);
    setCountdown(UNDO_SECONDS);
    intervalRef.current = setInterval(() => {
      setCountdown(c => c - 1);
    }, 1000);
    timerRef.current = setTimeout(() => {
      clearInterval(intervalRef.current!);
      onIgnore?.();
    }, UNDO_SECONDS * 1000);
  };

  const handleUndo = () => {
    clearTimeout(timerRef.current!);
    clearInterval(intervalRef.current!);
    setPendingIgnore(false);
    setCountdown(UNDO_SECONDS);
  };

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current!);
      clearInterval(intervalRef.current!);
    };
  }, []);

  const handleImgError = () => {
    if (!imgFailed && item.posterUrl && imgSrc !== item.posterUrl) {
      setImgSrc(item.posterUrl);
      setImgFailed(true);
    }
  };

  const openUrl =
    item.slug && item.service === 'sonarr' && sonarrUrl
      ? `${sonarrUrl}/series/${item.slug}`
      : item.slug && item.service === 'radarr' && radarrUrl
        ? `${radarrUrl}/movie/${item.slug}`
        : null;

  const openServiceLabel = item.service === 'sonarr' ? 'Sonarr' : 'Radarr';
  const subsLabel = item.foundSubtitles || 'unknown';
  const haveEnglish = item.totalFiles - item.affectedFiles;

  const visibleEpisodes = (item.affectedEpisodes ?? []).filter(ep => !dismissedFileIds.has(ep.fileId));
  const hasSonarrFiles = item.service === 'sonarr' && (item.affectedEpisodes?.length ?? 0) > 0;

  const visibleFileIds = (item.affectedFileIds ?? []).filter(id => !dismissedFileIds.has(id));
  const hasRadarrFiles = item.service === 'radarr' && (item.affectedFileIds?.length ?? 0) > 0;

  const handleFileDone = (fileId: number) => {
    setDismissedFileIds(prev => new Set([...prev, fileId]));
  };

  const handleMarkAll = async () => {
    if (!hasSonarrFiles || visibleEpisodes.length === 0) return;
    setMarkAllState('loading');
    try {
      await Promise.all(
        visibleEpisodes.map(ep =>
          fetchApi('/api/sonarr/mark-failed', {
            method: 'POST',
            body: JSON.stringify({ seriesId: item.id, episodeFileId: ep.fileId, episodeId: ep.episodeId }),
          })
        )
      );
      setDismissedFileIds(new Set(visibleEpisodes.map(ep => ep.fileId)));
      setMarkAllState('done');
    } catch {
      setMarkAllState('error');
    }
  };

  return (
    <div className={`amcard${pendingIgnore ? ' amcard--pending-ignore' : ''}`}>
      <div className="amcard__poster-wrap">
        {imgSrc && !imgFailed ? (
          <img className="amcard__poster" src={imgSrc} alt={item.title} loading="lazy" onError={handleImgError} />
        ) : item.posterUrl ? (
          <img className="amcard__poster" src={item.posterUrl} alt={item.title} loading="lazy" />
        ) : (
          <div className="amcard__poster-placeholder">No Image</div>
        )}
        <span
          className="amcard__count-bubble"
          title={`${item.affectedFiles} episode${item.affectedFiles !== 1 ? 's' : ''} missing English subtitles`}
        >
          {item.affectedFiles}
        </span>
        <span className="amcard__badge amcard__badge--no-english-subs" title={`Detected subtitles: ${subsLabel}`}>
          No Eng Subs
        </span>
      </div>

      {pendingIgnore ? (
        <div className="amcard__ignore-overlay">
          <span className="amcard__ignore-label">Marked as false positive</span>
          <button className="amcard__undo-btn" onClick={handleUndo}>
            Undo ({countdown}s)
          </button>
        </div>
      ) : (
      <div className="amcard__info">
        <div className="amcard__title" title={item.title}>{item.title}</div>
        {item.year && <div className="amcard__year">{item.year}</div>}
        <div className="amcard__progress">
          <ProgressBar have={haveEnglish} total={item.totalFiles} />
        </div>
        <div className="amcard__actions">
          {openUrl && (
            <a className="amcard__btn amcard__btn--open" href={openUrl} target="_blank" rel="noreferrer" title={`Open in ${openServiceLabel}`}>
              Open in {openServiceLabel} ↗
            </a>
          )}
          {onIgnore && (
            <button
              className="amcard__btn amcard__btn--ignore"
              onClick={startIgnore}
              title="Mark as false positive — hide from this list"
            >
              Ignore
            </button>
          )}
        </div>

        {/* Sonarr: expandable episode list + mark all */}
        {hasSonarrFiles && (
          <>
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              <button className="amcard__toggle" style={{ flex: 1, marginTop: 0 }} onClick={() => setShowFiles(o => !o)}>
                {showFiles ? '▾' : '▸'} Affected episodes
              </button>
              {visibleEpisodes.length > 1 && (
                <button
                  className={`amcard__btn--retry${markAllState === 'done' ? ' amcard__btn--retry--done' : ''}`}
                  style={{ marginTop: 0, fontSize: '0.68rem' }}
                  disabled={markAllState === 'loading' || markAllState === 'done'}
                  onClick={handleMarkAll}
                  title="Mark all affected files as failed and search for replacements"
                >
                  {markAllState === 'loading' ? '...' : markAllState === 'done' ? '✓ All Queued' : 'Mark All'}
                </button>
              )}
            </div>
            {showFiles && visibleEpisodes.length > 0 && (
              <div className="amcard__episode-list">
                {visibleEpisodes.map(ep => (
                  <EpisodeRow key={ep.fileId} ep={ep} seriesId={item.id} onDone={handleFileDone} />
                ))}
              </div>
            )}
            {showFiles && visibleEpisodes.length === 0 && (
              <div className="amcard__episode-title" style={{ marginTop: 6, textAlign: 'center' }}>
                All queued for replacement
              </div>
            )}
          </>
        )}

        {/* Radarr: movie file list */}
        {hasRadarrFiles && (
          <>
            <button className="amcard__toggle" onClick={() => setShowFiles(o => !o)}>
              {showFiles ? '▾' : '▸'} Affected episodes
            </button>
            {showFiles && visibleFileIds.length > 0 && (
              <div className="amcard__episode-list">
                {visibleFileIds.map(fileId => (
                  <MovieFileRow key={fileId} fileId={fileId} movieId={item.id} onDone={handleFileDone} />
                ))}
              </div>
            )}
            {showFiles && visibleFileIds.length === 0 && (
              <div className="amcard__episode-title" style={{ marginTop: 6, textAlign: 'center' }}>
                All queued for replacement
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}
