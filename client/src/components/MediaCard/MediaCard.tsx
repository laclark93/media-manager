import { useState } from 'react';
import { StalenessLevel } from '../../types/common';
import { getStalenessLabel, getStalenessColor } from '../../utils/staleness';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import './MediaCard.css';

interface MediaCardProps {
  id: number;
  title: string;
  year: number;
  posterUrl: string;
  remotePosterUrl: string;
  dateAdded: string;
  showDateAdded?: boolean;
  stalenessLevel: StalenessLevel;
  type: 'show' | 'movie';
  episodeFileCount?: number;
  episodeCount?: number;
  radarrUrl?: string;
  radarrMovieId?: number;
  sonarrUrl?: string;
  sonarrSeriesSlug?: string;
  requestedBy?: string | null;
  onCardClick?: () => void;
  onSearchAll?: () => Promise<void>;
  onSearch?: () => Promise<void>;
}

export function MediaCard({
  title,
  year,
  posterUrl,
  remotePosterUrl,
  dateAdded,
  showDateAdded,
  stalenessLevel,
  type,
  episodeFileCount,
  episodeCount,
  radarrUrl,
  radarrMovieId,
  sonarrUrl,
  sonarrSeriesSlug,
  requestedBy,
  onCardClick,
  onSearchAll,
  onSearch,
}: MediaCardProps) {
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'queued'>('idle');
  const [imgSrc, setImgSrc] = useState(remotePosterUrl || posterUrl);
  const [imgError, setImgError] = useState(false);

  const handleSearch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (searchState !== 'idle') return;
    setSearchState('searching');
    try {
      if (type === 'show' && onSearchAll) {
        await onSearchAll();
      } else if (type === 'movie' && onSearch) {
        await onSearch();
      }
      setSearchState('queued');
      setTimeout(() => setSearchState('idle'), 3000);
    } catch {
      setSearchState('idle');
    }
  };

  const handleImgError = () => {
    if (!imgError && posterUrl && imgSrc !== posterUrl) {
      setImgSrc(posterUrl);
      setImgError(true);
    }
  };

  const btnClass =
    searchState === 'searching'
      ? 'media-card__btn media-card__btn--searching'
      : searchState === 'queued'
        ? 'media-card__btn media-card__btn--queued'
        : 'media-card__btn media-card__btn--search';

  const btnText =
    searchState === 'searching'
      ? 'Searching...'
      : searchState === 'queued'
        ? 'Queued'
        : type === 'show'
          ? 'Search All'
          : 'Search';

  return (
    <div className="media-card" onClick={onCardClick}>
      <div className="media-card__poster-wrap">
        {imgSrc && !imgError ? (
          <img
            className="media-card__poster"
            src={imgSrc}
            alt={title}
            loading="lazy"
            onError={handleImgError}
          />
        ) : posterUrl ? (
          <img
            className="media-card__poster"
            src={posterUrl}
            alt={title}
            loading="lazy"
          />
        ) : (
          <div className="media-card__poster-placeholder">No Image</div>
        )}
        <span
          className="media-card__staleness"
          style={{ backgroundColor: getStalenessColor(stalenessLevel) }}
        >
          {getStalenessLabel(stalenessLevel)}
        </span>
        {requestedBy !== undefined && (
          <div className="media-card__requester">
            {requestedBy ? `Requested by ${requestedBy}` : 'Direct Request'}
          </div>
        )}
      </div>
      <div className="media-card__info">
        <div className="media-card__title" title={title}>{title}</div>
        <div className="media-card__year">
          {year}
          {showDateAdded && dateAdded && (
            <span className="media-card__date-added">
              {' \u00B7 Added '}
              {new Date(dateAdded).toLocaleDateString()}
            </span>
          )}
        </div>
        {type === 'show' && episodeFileCount !== undefined && episodeCount !== undefined && (
          <div className="media-card__progress">
            <ProgressBar have={episodeFileCount} total={episodeCount} />
          </div>
        )}
        <div className="media-card__actions">
          <button className={btnClass} onClick={handleSearch} disabled={searchState !== 'idle'}>
            {btnText}
          </button>
          {type === 'show' && sonarrUrl && sonarrSeriesSlug && (
            <a
              className="media-card__btn media-card__btn--radarr"
              href={`${sonarrUrl}/series/${sonarrSeriesSlug}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Open in Sonarr"
            >
              ↗
            </a>
          )}
          {type === 'movie' && radarrUrl && radarrMovieId && (
            <a
              className="media-card__btn media-card__btn--radarr"
              href={`${radarrUrl}/movie/${radarrMovieId}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Open in Radarr"
            >
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
