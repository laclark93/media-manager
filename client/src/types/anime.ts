export interface AnimeMismatch {
  id: number;
  title: string;
  year?: number;
  service: 'sonarr' | 'radarr';
  /** 'anime-not-tagged' = IS anime but missing the "anime" tag
   *  'tagged-not-anime' = HAS the "anime" tag but doesn't look like anime
   *  'wrong-directory'  = IS anime (tagged/typed) but not in the anime root folder */
  mismatchType: 'anime-not-tagged' | 'tagged-not-anime' | 'wrong-directory';
  seriesType?: string;
  genres?: string[];
  originalLanguage?: string;
  slug?: string;
  posterUrl?: string;
  remotePosterUrl?: string;
  hasMissing?: boolean;
  currentPath?: string;
}

export interface AffectedEpisode {
  fileId: number;
  episodeId: number | null;
  seasonNumber: number;
  episodeNumber: number | null;
  title: string | null;
  subtitles: string;
}

export interface SubtitleMissing {
  id: number;
  title: string;
  year?: number;
  service: 'sonarr' | 'radarr';
  affectedFiles: number;
  totalFiles: number;
  foundSubtitles: string;
  /** Per-file episode detail (Sonarr only) */
  affectedEpisodes?: AffectedEpisode[];
  /** Affected movie file IDs (Radarr only) */
  affectedFileIds?: number[];
  slug?: string;
  posterUrl?: string;
  remotePosterUrl?: string;
}
