import { useState } from 'react';
import { useEarlyFiles } from '../hooks/useEarlyFiles';
import { useSettings } from '../hooks/useSettings';
import { fetchApi } from '../utils/api';
import { EarlySeriesItem, EarlyMovieItem } from '../types/early';
import { LastUpdated } from '../components/LastUpdated/LastUpdated';
import './Early.css';

function formatAirDate(utcStr: string): string {
  const d = new Date(utcStr);
  const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const rel = days <= 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${rel})`;
}

function formatDate(str: string | undefined): string | null {
  if (!str) return null;
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Poster({ posterUrl, remotePosterUrl, title }: { posterUrl?: string; remotePosterUrl?: string; title: string }) {
  const [src, setSrc] = useState(posterUrl || remotePosterUrl || '');
  if (!src) return <div className="early-item__poster-placeholder" />;
  return (
    <img
      src={src}
      alt={title}
      onError={() => {
        if (src === posterUrl && remotePosterUrl) setSrc(remotePosterUrl);
        else setSrc('');
      }}
    />
  );
}

function EpisodeSeriesCard({
  item,
  deletingFileId,
  onDelete,
  sonarrUrl,
}: {
  item: EarlySeriesItem;
  deletingFileId: number | null;
  onDelete: (fileId: number, instanceUrl?: string) => void;
  sonarrUrl: string;
}) {
  const seriesLink = sonarrUrl ? `${sonarrUrl.replace(/\/$/, '')}/series/${item.slug}` : undefined;

  return (
    <div className="early-item">
      <div className="early-item__poster">
        <Poster posterUrl={item.posterUrl} remotePosterUrl={item.remotePosterUrl} title={item.title} />
      </div>
      <div className="early-item__body">
        <div>
          {seriesLink ? (
            <a href={seriesLink} target="_blank" rel="noopener noreferrer" className="early-item__title">
              {item.title}
            </a>
          ) : (
            <span className="early-item__title">{item.title}</span>
          )}
          <span className="early-item__year">{item.year}</span>
        </div>
        <div className="early-item__episodes">
          {item.episodes.map(ep => (
            <div key={ep.fileId} className="early-episode-row">
              <span className="early-episode-row__id">
                S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
              </span>
              {ep.title && <span className="early-episode-row__title">"{ep.title}"</span>}
              <span className="early-episode-row__date">airs {formatAirDate(ep.airDateUtc)}</span>
              <button
                className="early-episode-row__delete"
                onClick={() => onDelete(ep.fileId, item.instanceUrl)}
                disabled={deletingFileId === ep.fileId}
                title="Delete file from Sonarr"
              >
                {deletingFileId === ep.fileId ? '…' : 'Delete File'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MovieCard({
  item,
  deletingFileId,
  onDelete,
  radarrUrl,
}: {
  item: EarlyMovieItem;
  deletingFileId: number | null;
  onDelete: (fileId: number, instanceUrl?: string) => void;
  radarrUrl: string;
}) {
  const movieLink = radarrUrl ? `${radarrUrl.replace(/\/$/, '')}/movie/${item.slug}` : undefined;
  const digital = formatDate(item.digitalRelease);
  const physical = formatDate(item.physicalRelease);
  const cinemas = formatDate(item.inCinemas);

  return (
    <div className="early-item">
      <div className="early-item__poster">
        <Poster posterUrl={item.posterUrl} remotePosterUrl={item.remotePosterUrl} title={item.title} />
      </div>
      <div className="early-item__body">
        <div>
          {movieLink ? (
            <a href={movieLink} target="_blank" rel="noopener noreferrer" className="early-item__title">
              {item.title}
            </a>
          ) : (
            <span className="early-item__title">{item.title}</span>
          )}
          <span className="early-item__year">{item.year}</span>
        </div>
        <div className="early-item__movie-meta">
          <span className="early-item__status">{item.status}</span>
          {cinemas && (
            <span className="early-item__date-label">In Cinemas: <span>{cinemas}</span></span>
          )}
          {digital && (
            <span className="early-item__date-label">Digital: <span>{digital}</span></span>
          )}
          {physical && (
            <span className="early-item__date-label">Physical: <span>{physical}</span></span>
          )}
        </div>
        {item.fileId != null && (
          <button
            className="early-item__delete-movie"
            onClick={() => onDelete(item.fileId!, item.instanceUrl)}
            disabled={deletingFileId === item.fileId}
            title="Delete file from Radarr"
          >
            {deletingFileId === item.fileId ? '…' : 'Delete File'}
          </button>
        )}
      </div>
    </div>
  );
}

export function Early() {
  const { episodes, movies, loading, refreshing, error, refresh, lastUpdated } = useEarlyFiles();
  const { settings } = useSettings();
  const [episodesOpen, setEpisodesOpen] = useState(true);
  const [moviesOpen, setMoviesOpen] = useState(true);
  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);
  const [deletedFileIds, setDeletedFileIds] = useState<Set<number>>(new Set());

  const visibleEpisodes = episodes
    .map(s => ({ ...s, episodes: s.episodes.filter(ep => !deletedFileIds.has(ep.fileId)) }))
    .filter(s => s.episodes.length > 0);

  const visibleMovies = movies.filter(m => m.fileId == null || !deletedFileIds.has(m.fileId));

  const handleDeleteEpisodeFile = async (fileId: number, instanceUrl?: string) => {
    setDeletingFileId(fileId);
    try {
      const qs = instanceUrl ? `?instanceUrl=${encodeURIComponent(instanceUrl)}` : '';
      await fetchApi(`/api/sonarr/episode-file/${fileId}${qs}`, { method: 'DELETE' });
      setDeletedFileIds(prev => new Set([...prev, fileId]));
    } catch {
      // ignore — file stays visible
    }
    setDeletingFileId(null);
  };

  const handleDeleteMovieFile = async (fileId: number, instanceUrl?: string) => {
    setDeletingFileId(fileId);
    try {
      const qs = instanceUrl ? `?instanceUrl=${encodeURIComponent(instanceUrl)}` : '';
      await fetchApi(`/api/radarr/movie-file/${fileId}${qs}`, { method: 'DELETE' });
      setDeletedFileIds(prev => new Set([...prev, fileId]));
    } catch {
      // ignore — file stays visible
    }
    setDeletingFileId(null);
  };

  if (loading) return <div className="page-loading">Loading…</div>;
  if (error) return <div className="page-error">{error}</div>;

  const totalCount = visibleEpisodes.reduce((n, s) => n + s.episodes.length, 0) + visibleMovies.length;

  return (
    <div className="page-content">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="early-page__heading" style={{ margin: 0, flex: 1 }}>Pre-Release Files</h1>
        <LastUpdated timestamp={lastUpdated ?? null} />
        <button
          className="early-page__refresh"
          onClick={refresh}
          disabled={refreshing}
          title="Refresh"
        >
          {refreshing ? '…' : '↺'}
        </button>
      </div>

      {totalCount === 0 && (
        <div className="early-page__empty">No pre-release files found.</div>
      )}

      {/* Episodes section */}
      <div className="early-page__section">
        <div className="early-page__section-header" onClick={() => setEpisodesOpen(o => !o)}>
          <span className="early-page__section-title">Episodes</span>
          <span className="early-page__count">{visibleEpisodes.reduce((n, s) => n + s.episodes.length, 0)}</span>
          <span className="early-page__chevron">{episodesOpen ? '▲' : '▼'}</span>
        </div>
        {episodesOpen && (
          visibleEpisodes.length === 0
            ? <div className="early-page__empty">No pre-release episodes.</div>
            : visibleEpisodes.map(item => (
                <EpisodeSeriesCard
                  key={item.seriesId}
                  item={item}
                  deletingFileId={deletingFileId}
                  onDelete={handleDeleteEpisodeFile}
                  sonarrUrl={item.instanceUrl || settings?.sonarrUrl || ''}
                />
              ))
        )}
      </div>

      {/* Movies section */}
      <div className="early-page__section">
        <div className="early-page__section-header" onClick={() => setMoviesOpen(o => !o)}>
          <span className="early-page__section-title">Movies</span>
          <span className="early-page__count">{visibleMovies.length}</span>
          <span className="early-page__chevron">{moviesOpen ? '▲' : '▼'}</span>
        </div>
        {moviesOpen && (
          visibleMovies.length === 0
            ? <div className="early-page__empty">No pre-release movies.</div>
            : visibleMovies.map(item => (
                <MovieCard
                  key={item.id}
                  item={item}
                  deletingFileId={deletingFileId}
                  onDelete={handleDeleteMovieFile}
                  radarrUrl={item.instanceUrl || settings?.radarrUrl || ''}
                />
              ))
        )}
      </div>
    </div>
  );
}
