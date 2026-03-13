import { SonarrSeries } from '../types/sonarr';
import { RadarrMovie } from '../types/radarr';

export function getSonarrPosterUrl(series: SonarrSeries): string {
  const poster = series.images.find(img => img.coverType === 'poster');
  if (!poster) return '';
  // Server returns full proxy path (e.g. /api/sonarr/image/0/MediaCover/...)
  // Fall back to prepending for backward compat with older data
  if (poster.url.startsWith('/api/')) return poster.url;
  return `/api/sonarr/image${poster.url}`;
}

export function getSonarrRemotePoster(series: SonarrSeries): string {
  const poster = series.images.find(img => img.coverType === 'poster');
  return poster?.remoteUrl || '';
}

export function getRadarrPosterUrl(movie: RadarrMovie): string {
  const poster = movie.images.find(img => img.coverType === 'poster');
  if (!poster) return '';
  if (poster.url.startsWith('/api/')) return poster.url;
  return `/api/radarr/image${poster.url}`;
}

export function getRadarrRemotePoster(movie: RadarrMovie): string {
  const poster = movie.images.find(img => img.coverType === 'poster');
  return poster?.remoteUrl || '';
}
