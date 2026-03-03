import { SonarrSeries } from '../types/sonarr';
import { RadarrMovie } from '../types/radarr';

export function getSonarrPosterUrl(series: SonarrSeries): string {
  const poster = series.images.find(img => img.coverType === 'poster');
  if (!poster) return '';
  return `/api/sonarr/image${poster.url}`;
}

export function getSonarrRemotePoster(series: SonarrSeries): string {
  const poster = series.images.find(img => img.coverType === 'poster');
  return poster?.remoteUrl || '';
}

export function getRadarrPosterUrl(movie: RadarrMovie): string {
  const poster = movie.images.find(img => img.coverType === 'poster');
  if (!poster) return '';
  return `/api/radarr/image${poster.url}`;
}

export function getRadarrRemotePoster(movie: RadarrMovie): string {
  const poster = movie.images.find(img => img.coverType === 'poster');
  return poster?.remoteUrl || '';
}
