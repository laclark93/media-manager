import { useNavigate } from 'react-router-dom';
import { useSonarr } from '../hooks/useSonarr';
import { useRadarr } from '../hooks/useRadarr';
import { useJellyseerr } from '../hooks/useJellyseerr';
import { useSubtitleCheck } from '../hooks/useSubtitleCheck';
import { useSettings } from '../hooks/useSettings';
import { useIgnoredSubtitles } from '../hooks/useIgnoredSubtitles';
import { StalenessLevel, DEFAULT_THRESHOLDS } from '../types/common';
import { getStaleness } from '../utils/staleness';
import './Dashboard.css';

export function Dashboard() {
  const navigate = useNavigate();
  const { series, loading: showsLoading } = useSonarr();
  const { movies, loading: moviesLoading } = useRadarr();
  const { issues, loading: issuesLoading } = useJellyseerr();
  const { items: subtitleItems, loading: subsLoading } = useSubtitleCheck();
  const { settings } = useSettings();
  const { ignoredKeys: ignoredSubKeys } = useIgnoredSubtitles();

  const visibleSubtitleItems = subtitleItems.filter(i => !ignoredSubKeys.has(`${i.service}-${i.id}`));

  const thresholds = settings?.stalenessThresholds ?? DEFAULT_THRESHOLDS;

  // Shows with missing episodes
  const showsWithMissing = series.filter(
    s => s.statistics.episodeCount - s.statistics.episodeFileCount > 0
  );
  const totalMissingEpisodes = showsWithMissing.reduce(
    (sum, s) => sum + (s.statistics.episodeCount - s.statistics.episodeFileCount), 0
  );

  // Movies missing files
  const missingMovies = movies.filter(m => !m.hasFile && m.isAvailable);

  // Staleness breakdown for shows (uses same logic as Shows page: latestMissingAirDate || previousAiring)
  const showStaleness = { fresh: 0, stale: 0, veryStale: 0, ancient: 0 };
  for (const s of showsWithMissing) {
    const lastAired = s.latestMissingAirDate || s.previousAiring;
    const level = getStaleness(s.dateAdded, thresholds, lastAired);
    if (level === StalenessLevel.Fresh) showStaleness.fresh++;
    else if (level === StalenessLevel.Stale) showStaleness.stale++;
    else if (level === StalenessLevel.VeryStale) showStaleness.veryStale++;
    else showStaleness.ancient++;
  }

  // Staleness breakdown for movies
  const movieStaleness = { fresh: 0, stale: 0, veryStale: 0, ancient: 0 };
  for (const m of missingMovies) {
    const release = m.physicalRelease || m.digitalRelease || m.inCinemas;
    const level = getStaleness(m.added, thresholds, release);
    if (level === StalenessLevel.Fresh) movieStaleness.fresh++;
    else if (level === StalenessLevel.Stale) movieStaleness.stale++;
    else if (level === StalenessLevel.VeryStale) movieStaleness.veryStale++;
    else movieStaleness.ancient++;
  }

  const cardClass = (count: number, loading: boolean) => {
    if (loading) return 'dashboard__card dashboard__card--loading';
    if (count === 0) return 'dashboard__card dashboard__card--zero';
    if (count >= 10) return 'dashboard__card dashboard__card--danger';
    return 'dashboard__card dashboard__card--warn';
  };

  const stalenessBar = (label: string, count: number, total: number, color: string) => (
    <div className="dashboard__bar-row" key={label}>
      <span className="dashboard__bar-label">{label}</span>
      <div className="dashboard__bar-track">
        <div
          className="dashboard__bar-fill"
          style={{
            width: total > 0 ? `${(count / total) * 100}%` : '0%',
            background: color,
          }}
        />
      </div>
      <span className="dashboard__bar-count">{count}</span>
    </div>
  );

  return (
    <div className="dashboard page">
      <h1 className="dashboard__title">Dashboard</h1>

      <div className="dashboard__cards">
        <div className={cardClass(showsWithMissing.length, showsLoading)} onClick={() => navigate('/shows')}>
          <div className="dashboard__card-header">
            <span className="dashboard__card-label">Shows Missing</span>
            <span className="dashboard__card-icon">📺</span>
          </div>
          <span className="dashboard__card-value">
            {showsLoading ? '—' : showsWithMissing.length}
          </span>
          <span className="dashboard__card-sub">
            {showsLoading ? 'Loading...' : `${totalMissingEpisodes} episode${totalMissingEpisodes !== 1 ? 's' : ''} total`}
          </span>
        </div>

        <div className={cardClass(missingMovies.length, moviesLoading)} onClick={() => navigate('/movies')}>
          <div className="dashboard__card-header">
            <span className="dashboard__card-label">Movies Missing</span>
            <span className="dashboard__card-icon">🎬</span>
          </div>
          <span className="dashboard__card-value">
            {moviesLoading ? '—' : missingMovies.length}
          </span>
          <span className="dashboard__card-sub">
            {moviesLoading ? 'Loading...' : `${movies.length} monitored total`}
          </span>
        </div>

        <div className={cardClass(issues.length, issuesLoading)} onClick={() => navigate('/issues')}>
          <div className="dashboard__card-header">
            <span className="dashboard__card-label">Open Issues</span>
            <span className="dashboard__card-icon">⚠️</span>
          </div>
          <span className="dashboard__card-value">
            {issuesLoading ? '—' : issues.length}
          </span>
          <span className="dashboard__card-sub">
            {issuesLoading ? 'Loading...' : 'Jellyseerr issues'}
          </span>
        </div>

        <div className={cardClass(visibleSubtitleItems.length, subsLoading)} onClick={() => navigate('/anime')}>
          <div className="dashboard__card-header">
            <span className="dashboard__card-label">Subtitle Issues</span>
            <span className="dashboard__card-icon">💬</span>
          </div>
          <span className="dashboard__card-value">
            {subsLoading ? '—' : visibleSubtitleItems.length}
          </span>
          <span className="dashboard__card-sub">
            {subsLoading ? 'Loading...' : 'Missing English subs'}
          </span>
        </div>
      </div>

      {/* Service Status */}
      {settings && (
        <div className="dashboard__services">
          <div className="dashboard__section-title">Services</div>
          <div className="dashboard__service-list">
            <div className="dashboard__service">
              <span className={`dashboard__service-dot ${settings.sonarrConfigured ? 'dashboard__service-dot--ok' : 'dashboard__service-dot--off'}`} />
              Sonarr
            </div>
            <div className="dashboard__service">
              <span className={`dashboard__service-dot ${settings.radarrConfigured ? 'dashboard__service-dot--ok' : 'dashboard__service-dot--off'}`} />
              Radarr
            </div>
            <div className="dashboard__service">
              <span className={`dashboard__service-dot ${settings.jellyseerrConfigured ? 'dashboard__service-dot--ok' : 'dashboard__service-dot--off'}`} />
              Jellyseerr
            </div>
            <div className="dashboard__service">
              <span className={`dashboard__service-dot ${settings.plexConfigured ? 'dashboard__service-dot--ok' : 'dashboard__service-dot--off'}`} />
              Plex
            </div>
          </div>
        </div>
      )}

      {/* Staleness Breakdown */}
      {!showsLoading && showsWithMissing.length > 0 && (
        <div className="dashboard__breakdown">
          <div className="dashboard__section-title">Shows Staleness</div>
          {stalenessBar('Fresh', showStaleness.fresh, showsWithMissing.length, 'var(--fresh)')}
          {stalenessBar('Stale', showStaleness.stale, showsWithMissing.length, 'var(--stale)')}
          {stalenessBar('Very Stale', showStaleness.veryStale, showsWithMissing.length, 'var(--very-stale)')}
          {stalenessBar('Ancient', showStaleness.ancient, showsWithMissing.length, 'var(--ancient)')}
        </div>
      )}

      {!moviesLoading && missingMovies.length > 0 && (
        <div className="dashboard__breakdown">
          <div className="dashboard__section-title">Movies Staleness</div>
          {stalenessBar('Fresh', movieStaleness.fresh, missingMovies.length, 'var(--fresh)')}
          {stalenessBar('Stale', movieStaleness.stale, missingMovies.length, 'var(--stale)')}
          {stalenessBar('Very Stale', movieStaleness.veryStale, missingMovies.length, 'var(--very-stale)')}
          {stalenessBar('Ancient', movieStaleness.ancient, missingMovies.length, 'var(--ancient)')}
        </div>
      )}
    </div>
  );
}
