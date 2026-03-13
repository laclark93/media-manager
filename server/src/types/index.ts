export interface ServiceInstance {
  name: string;
  url: string;
  apiKey: string;
  animeTag: string;
}

export interface Settings {
  // Legacy single-instance fields (kept for backward compat / migration)
  sonarrUrl?: string;
  sonarrApiKey?: string;
  sonarrAnimeTag?: string;
  radarrUrl?: string;
  radarrApiKey?: string;
  radarrAnimeTag?: string;
  // Multi-instance fields
  sonarrInstances?: ServiceInstance[];
  radarrInstances?: ServiceInstance[];
  jellyseerrUrl?: string;
  jellyseerrApiKey?: string;
  plexToken?: string;
  stalenessThresholds?: StalenessThresholds;
  username?: string;
  passwordHash?: string;
  jwtSecret?: string;
}

export interface StalenessThresholds {
  staleDays: number;
  veryStaledays: number;
  ancientDays: number;
}

export interface AppConfig {
  sonarrInstances: ServiceInstance[];
  radarrInstances: ServiceInstance[];
  jellyseerrUrl: string;
  jellyseerrApiKey: string;
  plexToken: string;
  stalenessThresholds: StalenessThresholds;
  port: number;
}

export interface JellyseerrIssue {
  id: number;
  issueType: number;
  status: number;
  problemSeason: number;
  problemEpisode: number;
  createdAt: string;
  updatedAt: string;
  media: JellyseerrMedia;
  comments: JellyseerrComment[];
  reportedBy?: { displayName: string };
  // enriched by backend
  mediaTitle?: string;
  mediaYear?: number;
  posterUrl?: string;
  remotePosterUrl?: string;
  externalServiceId?: number;
}

export interface JellyseerrMedia {
  id: number;
  tmdbId: number;
  tvdbId?: number;
  mediaType: 'movie' | 'tv';
  status: number;
  externalServiceId?: number;
  externalServiceId4k?: number;
  posterPath?: string;
}

export interface JellyseerrComment {
  id: number;
  message: string;
  createdAt: string;
}

export interface SonarrSeries {
  id: number;
  title: string;
  sortTitle: string;
  status: string;
  overview: string;
  network: string;
  year: number;
  path: string;
  monitored: boolean;
  seasonFolder: boolean;
  runtime: number;
  tvdbId: number;
  imdbId: string;
  certification: string;
  genres: string[];
  tags: number[];
  seriesType: string;
  titleSlug: string;
  images: SonarrImage[];
  seasons: SonarrSeason[];
  statistics: SonarrStatistics;
  dateAdded: string;
  previousAiring?: string;
  nextAiring?: string;
}

export interface SonarrImage {
  coverType: string;
  url: string;
  remoteUrl: string;
}

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
}

export interface SonarrStatistics {
  seasonCount: number;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  sizeOnDisk: number;
  percentOfEpisodes: number;
}

export interface SonarrEpisode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string;
  airDateUtc: string;
  overview: string;
  hasFile: boolean;
  monitored: boolean;
  episodeFileId?: number;
}

export interface SonarrHistoryRecord {
  id: number;
  episodeId: number;
  seriesId: number;
  eventType: string; // 'grabbed' | 'downloadFolderImported' | 'downloadFailed' | etc.
  sourceTitle?: string;
  date?: string;
  quality?: { quality?: { name?: string } };
}

export interface RadarrHistoryRecord {
  id: number;
  movieId: number;
  eventType: string;
}

export interface RadarrMovie {
  id: number;
  title: string;
  originalTitle: string;
  sortTitle: string;
  status: string;
  overview: string;
  year: number;
  studio: string;
  path: string;
  monitored: boolean;
  hasFile: boolean;
  isAvailable: boolean;
  runtime: number;
  tmdbId: number;
  imdbId: string;
  certification: string;
  genres: string[];
  tags: number[];
  titleSlug: string;
  originalLanguage?: { id: number; name: string };
  images: RadarrImage[];
  added: string;
  physicalRelease?: string;
  digitalRelease?: string;
  inCinemas?: string;
  sizeOnDisk: number;
}

export interface ArrTag {
  id: number;
  label: string;
}

export interface SonarrEpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  path?: string;
  mediaInfo?: {
    subtitles?: string;
    audioLanguages?: string;
  };
}

export interface RadarrMovieFile {
  id: number;
  movieId: number;
  path?: string;
  mediaInfo?: {
    subtitles?: string;
    audioLanguages?: string;
  };
}

export interface RadarrImage {
  coverType: string;
  url: string;
  remoteUrl: string;
}
