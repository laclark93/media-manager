import { useState, useEffect, useRef } from 'react';
import { SubtitleMissing } from '../../types/anime';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import '../AnimeMismatchCard/AnimeMismatchCard.css';

const UNDO_SECONDS = 5;

interface SubtitleMissingCardProps {
  item: SubtitleMissing;
  sonarrUrl?: string;
  radarrUrl?: string;
  onIgnore?: () => void;
  onCardClick?: () => void;
}

export function SubtitleMissingCard({ item, sonarrUrl, radarrUrl, onIgnore, onCardClick }: SubtitleMissingCardProps) {
  const [imgSrc, setImgSrc] = useState(item.remotePosterUrl || item.posterUrl || '');
  const [imgFailed, setImgFailed] = useState(false);
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

  return (
    <div
      className={`amcard${pendingIgnore ? ' amcard--pending-ignore' : ''}`}
      onClick={!pendingIgnore ? onCardClick : undefined}
      style={{ cursor: pendingIgnore ? undefined : 'pointer' }}
    >
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
          {onIgnore && (
            <button
              className="amcard__btn amcard__btn--ignore"
              onClick={(e) => { e.stopPropagation(); startIgnore(); }}
              title="Mark as false positive — hide from this list"
            >
              Ignore
            </button>
          )}
          {openUrl && (
            <a
              className="amcard__btn amcard__btn--icon"
              href={openUrl}
              target="_blank"
              rel="noreferrer"
              title={`Open in ${openServiceLabel}`}
              onClick={(e) => e.stopPropagation()}
            >
              ↗
            </a>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
