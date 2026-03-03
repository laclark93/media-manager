import { useState, useEffect, useRef } from 'react';
import { JellyseerrIssue, ISSUE_TYPE_LABELS, ISSUE_TYPE_COLORS } from '../../types/jellyseerr';
import './IssueCard.css';

const UNDO_SECONDS = 6;

interface IssueCardProps {
  issue: JellyseerrIssue;
  sonarrUrl?: string;
  radarrUrl?: string;
  onSearch: () => Promise<void>;
  onResolve: () => Promise<void>;
  onUndo: () => Promise<void>;
  onDismiss: () => void;
}

export function IssueCard({ issue, sonarrUrl, radarrUrl, onSearch, onResolve, onUndo, onDismiss }: IssueCardProps) {
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'queued'>('idle');
  const [resolveState, setResolveState] = useState<'idle' | 'resolving' | 'resolved' | 'undoing'>('idle');
  const [countdown, setCountdown] = useState(UNDO_SECONDS);
  const [imgSrc, setImgSrc] = useState(issue.remotePosterUrl || issue.posterUrl || '');
  const [imgError, setImgError] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Countdown + auto-dismiss after resolve
  useEffect(() => {
    if (resolveState !== 'resolved') return;
    setCountdown(UNDO_SECONDS);
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          dismissRef.current();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resolveState]);

  const handleSearch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (searchState !== 'idle') return;
    setSearchState('searching');
    try {
      await onSearch();
      setSearchState('queued');
      setTimeout(() => setSearchState('idle'), 3000);
    } catch {
      setSearchState('idle');
    }
  };

  const handleResolve = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (resolveState !== 'idle') return;
    setResolveState('resolving');
    try {
      await onResolve();
      setResolveState('resolved');
    } catch {
      setResolveState('idle');
    }
  };

  const handleUndo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setResolveState('undoing');
    try {
      await onUndo();
      setResolveState('idle');
    } catch {
      setResolveState('resolved');
    }
  };

  const handleImgError = () => {
    if (!imgError && issue.posterUrl && imgSrc !== issue.posterUrl) {
      setImgSrc(issue.posterUrl);
      setImgError(true);
    }
  };

  const issueTypeLabel = ISSUE_TYPE_LABELS[issue.issueType] || 'Unknown Issue';
  const issueTypeColor = ISSUE_TYPE_COLORS[issue.issueType] || '#7f8c8d';
  const mediaTypeLabel = issue.media.mediaType === 'tv' ? 'TV' : 'Movie';
  const description = issue.comments?.[0]?.message;

  const openUrl =
    issue.mediaSlug && issue.media.mediaType === 'tv' && sonarrUrl
      ? `${sonarrUrl}/series/${issue.mediaSlug}`
      : issue.mediaSlug && issue.media.mediaType === 'movie' && radarrUrl
        ? `${radarrUrl}/movie/${issue.mediaSlug}`
        : null;

  const openLabel = issue.media.mediaType === 'tv' ? 'Open in Sonarr' : 'Open in Radarr';

  const searchBtnClass =
    searchState === 'searching'
      ? 'issue-card__btn issue-card__btn--searching'
      : searchState === 'queued'
        ? 'issue-card__btn issue-card__btn--queued'
        : 'issue-card__btn issue-card__btn--search';

  const isResolved = resolveState === 'resolved' || resolveState === 'undoing';

  return (
    <div className={`issue-card${isResolved ? ' issue-card--resolved' : ''}`}>
      <div className="issue-card__poster-wrap">
        {imgSrc && !imgError ? (
          <img
            className="issue-card__poster"
            src={imgSrc}
            alt={issue.mediaTitle || ''}
            loading="lazy"
            onError={handleImgError}
          />
        ) : issue.posterUrl ? (
          <img
            className="issue-card__poster"
            src={issue.posterUrl}
            alt={issue.mediaTitle || ''}
            loading="lazy"
          />
        ) : (
          <div className="issue-card__poster-placeholder">No Image</div>
        )}
        <span
          className="issue-card__type-badge"
          style={{ backgroundColor: issueTypeColor }}
        >
          {issueTypeLabel}
        </span>
        <span className="issue-card__media-type">{mediaTypeLabel}</span>
      </div>
      <div className="issue-card__info">
        <div className="issue-card__title" title={issue.mediaTitle || 'Unknown'}>
          {issue.mediaTitle || 'Unknown'}
        </div>
        <div className="issue-card__year">{issue.mediaYear}</div>
        {issue.problemSeason > 0 && (
          <div className="issue-card__episode">
            {`S${String(issue.problemSeason).padStart(2, '0')}`}
            {issue.problemEpisode > 0 ? `E${String(issue.problemEpisode).padStart(2, '0')}` : ''}
          </div>
        )}
        {description && (
          <div className="issue-card__description" title={description}>{description}</div>
        )}
        {issue.reportedBy && (
          <div className="issue-card__reporter">By {issue.reportedBy.displayName}</div>
        )}
        <div className="issue-card__date">{new Date(issue.createdAt).toLocaleDateString()}</div>
        <div className="issue-card__actions">
          {isResolved ? (
            <>
              <span className="issue-card__resolved-label">Resolved</span>
              <button
                className="issue-card__btn issue-card__btn--undo"
                onClick={handleUndo}
                disabled={resolveState === 'undoing'}
              >
                {resolveState === 'undoing' ? 'Undoing...' : `Undo (${countdown}s)`}
              </button>
            </>
          ) : (
            <>
              <button className={searchBtnClass} onClick={handleSearch} disabled={searchState !== 'idle'}>
                {searchState === 'searching' ? 'Searching...' : searchState === 'queued' ? 'Queued' : 'Search'}
              </button>
              <button
                className={`issue-card__btn ${resolveState === 'resolving' ? 'issue-card__btn--resolving' : 'issue-card__btn--resolve'}`}
                onClick={handleResolve}
                disabled={resolveState === 'resolving'}
              >
                {resolveState === 'resolving' ? 'Resolving...' : 'Resolve'}
              </button>
            </>
          )}
          {openUrl && (
            <a
              className="issue-card__btn issue-card__btn--open"
              href={openUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={openLabel}
            >
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
