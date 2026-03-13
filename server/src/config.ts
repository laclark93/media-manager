import { readSettings } from './settings.js';
import { AppConfig, ServiceInstance, StalenessThresholds } from './types/index.js';

const DEFAULT_THRESHOLDS: StalenessThresholds = {
  staleDays: 7,
  veryStaledays: 28,
  ancientDays: 90,
};

function buildInstances(
  settingsInstances: ServiceInstance[] | undefined,
  legacyUrl: string | undefined,
  legacyApiKey: string | undefined,
  legacyAnimeTag: string | undefined,
  envUrl: string | undefined,
  envApiKey: string | undefined,
  defaultName: string,
): ServiceInstance[] {
  // If instances array exists in settings, use it
  if (settingsInstances && settingsInstances.length > 0) {
    return settingsInstances.map(inst => ({
      name: inst.name || defaultName,
      url: inst.url || '',
      apiKey: inst.apiKey || '',
      animeTag: inst.animeTag || 'anime',
    }));
  }
  // Otherwise, migrate from legacy single-instance fields + env vars
  const url = legacyUrl || envUrl || '';
  const apiKey = legacyApiKey || envApiKey || '';
  if (!url && !apiKey) return [];
  return [{
    name: defaultName,
    url,
    apiKey,
    animeTag: legacyAnimeTag || 'anime',
  }];
}

export function getConfig(): AppConfig {
  const settings = readSettings();
  return {
    sonarrInstances: buildInstances(
      settings.sonarrInstances,
      settings.sonarrUrl, settings.sonarrApiKey, settings.sonarrAnimeTag,
      process.env.SONARR_URL, process.env.SONARR_API_KEY,
      'Sonarr',
    ),
    radarrInstances: buildInstances(
      settings.radarrInstances,
      settings.radarrUrl, settings.radarrApiKey, settings.radarrAnimeTag,
      process.env.RADARR_URL, process.env.RADARR_API_KEY,
      'Radarr',
    ),
    jellyseerrUrl: settings.jellyseerrUrl || process.env.JELLYSEERR_URL || '',
    jellyseerrApiKey: settings.jellyseerrApiKey || process.env.JELLYSEERR_API_KEY || '',
    plexToken: settings.plexToken || process.env.PLEX_TOKEN || '',
    stalenessThresholds: settings.stalenessThresholds || DEFAULT_THRESHOLDS,
    port: parseInt(process.env.PORT || '3000', 10),
  };
}

/** Find a specific instance by URL, for action endpoints */
export function findSonarrInstance(config: AppConfig, instanceUrl: string): ServiceInstance | undefined {
  return config.sonarrInstances.find(i => i.url === instanceUrl);
}

export function findRadarrInstance(config: AppConfig, instanceUrl: string): ServiceInstance | undefined {
  return config.radarrInstances.find(i => i.url === instanceUrl);
}
