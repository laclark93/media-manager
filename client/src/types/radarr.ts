export interface RadarrMovie {
  id: number;
  title: string;
  originalTitle: string;
  sortTitle: string;
  status: string;
  overview: string;
  year: number;
  studio: string;
  monitored: boolean;
  hasFile: boolean;
  isAvailable: boolean;
  runtime: number;
  images: RadarrImage[];
  added: string;
  physicalRelease?: string;
  digitalRelease?: string;
  inCinemas?: string;
  titleSlug?: string;
  tmdbId?: number;
  instanceUrl?: string;
  instanceName?: string;
  requestedBy?: string | null;
}

export interface RadarrImage {
  coverType: string;
  url: string;
  remoteUrl: string;
}
