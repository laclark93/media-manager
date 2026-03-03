import { readSettings } from './settings.js';
import { AppConfig, StalenessThresholds } from './types/index.js';

const DEFAULT_THRESHOLDS: StalenessThresholds = {
  staleDays: 7,
  veryStaledays: 28,
  ancientDays: 90,
};

export function getConfig(): AppConfig {
  const settings = readSettings();
  return {
    sonarrUrl: settings.sonarrUrl || process.env.SONARR_URL || '',
    sonarrApiKey: settings.sonarrApiKey || process.env.SONARR_API_KEY || '',
    radarrUrl: settings.radarrUrl || process.env.RADARR_URL || '',
    radarrApiKey: settings.radarrApiKey || process.env.RADARR_API_KEY || '',
    jellyseerrUrl: settings.jellyseerrUrl || process.env.JELLYSEERR_URL || '',
    jellyseerrApiKey: settings.jellyseerrApiKey || process.env.JELLYSEERR_API_KEY || '',
    plexToken: settings.plexToken || process.env.PLEX_TOKEN || '',
    stalenessThresholds: settings.stalenessThresholds || DEFAULT_THRESHOLDS,
    port: parseInt(process.env.PORT || '3000', 10),
  };
}
