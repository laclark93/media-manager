export interface EarlyEpisode {
  episodeId: number;
  fileId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDateUtc: string;
}

export interface EarlySeriesItem {
  seriesId: number;
  title: string;
  year: number;
  slug: string;
  service: 'sonarr';
  posterUrl?: string;
  remotePosterUrl?: string;
  episodes: EarlyEpisode[];
}

export interface EarlyMovieItem {
  id: number;
  fileId: number | null;
  title: string;
  year: number;
  slug: string;
  service: 'radarr';
  status: string;
  digitalRelease?: string;
  physicalRelease?: string;
  inCinemas?: string;
  posterUrl?: string;
  remotePosterUrl?: string;
}
