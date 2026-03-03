export interface JellyseerrMedia {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  tvdbId?: number;
  status: number;
  externalServiceId?: number;
  externalServiceSlug?: string;
}

export interface JellyseerrComment {
  id: number;
  message: string;
  createdAt: string;
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
  mediaTitle?: string;
  mediaYear?: number;
  mediaSlug?: string;
  posterUrl?: string;
  remotePosterUrl?: string;
  externalServiceId?: number;
}

export const ISSUE_TYPE_LABELS: Record<number, string> = {
  1: 'Video Quality',
  2: 'Audio Quality',
  3: 'Subtitle Issue',
  4: 'Wrong Content',
  5: 'Other',
};

export const ISSUE_TYPE_COLORS: Record<number, string> = {
  1: '#e74c3c',
  2: '#e67e22',
  3: '#f39c12',
  4: '#9b59b6',
  5: '#7f8c8d',
};
