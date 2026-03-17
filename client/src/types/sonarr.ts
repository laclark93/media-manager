export interface SonarrSeries {
  id: number;
  title: string;
  sortTitle: string;
  titleSlug: string;
  status: string;
  overview: string;
  network: string;
  year: number;
  monitored: boolean;
  images: SonarrImage[];
  statistics: SonarrStatistics;
  dateAdded: string;
  previousAiring?: string;
  latestMissingAirDate?: string;
  oldestMissingAirDate?: string;
  instanceUrl?: string;
  instanceName?: string;
}

export interface SonarrImage {
  coverType: string;
  url: string;
  remoteUrl: string;
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
}

export interface MissingTimelineEntry {
  seriesId: number;
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDateUtc: string;
}
