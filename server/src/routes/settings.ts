import { Router } from 'express';
import { getConfig } from '../config.js';
import * as log from '../logger.js';
import { readSettings, writeSettings } from '../settings.js';
import * as sonarrService from '../services/sonarr.js';
import * as radarrService from '../services/radarr.js';
import * as jellyseerrService from '../services/jellyseerr.js';
import * as plexService from '../services/plex.js';
import { Settings } from '../types/index.js';

const router = Router();

router.get('/', (_req, res) => {
  const config = getConfig();
  res.json({
    sonarrInstances: config.sonarrInstances.map(i => ({
      name: i.name,
      url: i.url,
      apiKeySet: !!i.apiKey,
      animeTag: i.animeTag,
    })),
    radarrInstances: config.radarrInstances.map(i => ({
      name: i.name,
      url: i.url,
      apiKeySet: !!i.apiKey,
      animeTag: i.animeTag,
    })),
    // Legacy convenience fields (first instance or empty)
    sonarrUrl: config.sonarrInstances[0]?.url || '',
    sonarrApiKeySet: !!config.sonarrInstances[0]?.apiKey,
    sonarrAnimeTag: config.sonarrInstances[0]?.animeTag || 'anime',
    radarrUrl: config.radarrInstances[0]?.url || '',
    radarrApiKeySet: !!config.radarrInstances[0]?.apiKey,
    radarrAnimeTag: config.radarrInstances[0]?.animeTag || 'anime',
    jellyseerrUrl: config.jellyseerrUrl,
    jellyseerrApiKeySet: !!config.jellyseerrApiKey,
    stalenessThresholds: config.stalenessThresholds,
    sonarrConfigured: config.sonarrInstances.some(i => i.url && i.apiKey),
    radarrConfigured: config.radarrInstances.some(i => i.url && i.apiKey),
    jellyseerrConfigured: !!(config.jellyseerrUrl && config.jellyseerrApiKey),
    plexTokenSet: !!config.plexToken,
    plexConfigured: !!config.plexToken,
  });
});

router.put('/', (req, res) => {
  const body = req.body;
  const current = readSettings();

  const updated: Settings = { ...current };

  // Handle multi-instance fields
  if (body.sonarrInstances !== undefined) {
    const existing = current.sonarrInstances ?? [];
    updated.sonarrInstances = (body.sonarrInstances as any[]).map((inst: any, idx: number) => ({
      name: inst.name || `Sonarr ${idx + 1}`,
      url: inst.url ?? '',
      // Keep existing API key if new one is empty
      apiKey: inst.apiKey || existing[idx]?.apiKey || '',
      animeTag: inst.animeTag ?? 'anime',
    }));
    // Clear legacy fields when using instances
    delete updated.sonarrUrl;
    delete updated.sonarrApiKey;
    delete updated.sonarrAnimeTag;
  } else if (body.sonarrUrl !== undefined) {
    // Legacy single-instance save (backward compat)
    updated.sonarrUrl = body.sonarrUrl ?? current.sonarrUrl;
    updated.sonarrApiKey = body.sonarrApiKey || current.sonarrApiKey;
    updated.sonarrAnimeTag = body.sonarrAnimeTag ?? current.sonarrAnimeTag;
  }

  if (body.radarrInstances !== undefined) {
    const existing = current.radarrInstances ?? [];
    updated.radarrInstances = (body.radarrInstances as any[]).map((inst: any, idx: number) => ({
      name: inst.name || `Radarr ${idx + 1}`,
      url: inst.url ?? '',
      apiKey: inst.apiKey || existing[idx]?.apiKey || '',
      animeTag: inst.animeTag ?? 'anime',
    }));
    delete updated.radarrUrl;
    delete updated.radarrApiKey;
    delete updated.radarrAnimeTag;
  } else if (body.radarrUrl !== undefined) {
    updated.radarrUrl = body.radarrUrl ?? current.radarrUrl;
    updated.radarrApiKey = body.radarrApiKey || current.radarrApiKey;
    updated.radarrAnimeTag = body.radarrAnimeTag ?? current.radarrAnimeTag;
  }

  if (body.jellyseerrUrl !== undefined) updated.jellyseerrUrl = body.jellyseerrUrl ?? current.jellyseerrUrl;
  if (body.jellyseerrApiKey !== undefined) updated.jellyseerrApiKey = body.jellyseerrApiKey || current.jellyseerrApiKey;
  if (body.plexToken !== undefined) updated.plexToken = body.plexToken || current.plexToken;
  if (body.stalenessThresholds !== undefined) updated.stalenessThresholds = body.stalenessThresholds ?? current.stalenessThresholds;

  writeSettings(updated);
  log.info('Settings: configuration updated');
  log.verbose(`Settings: updated keys — ${Object.keys(body).join(', ')}`);
  res.json({ success: true });
});

router.post('/test/sonarr', async (req, res) => {
  const { url, apiKey } = req.body;
  const config = getConfig();
  const effectiveKey = apiKey || config.sonarrInstances.find(i => i.url === url)?.apiKey || '';
  if (!url || !effectiveKey) {
    res.status(400).json({ error: 'URL and API key required' });
    return;
  }
  log.verbose(`Settings: testing Sonarr connection to ${url}`);
  const ok = await sonarrService.testConnection(url, effectiveKey);
  log.info(`Settings: Sonarr connection test ${ok ? 'succeeded' : 'failed'}`);
  res.json({ success: ok });
});

router.post('/test/radarr', async (req, res) => {
  const { url, apiKey } = req.body;
  const config = getConfig();
  const effectiveKey = apiKey || config.radarrInstances.find(i => i.url === url)?.apiKey || '';
  if (!url || !effectiveKey) {
    res.status(400).json({ error: 'URL and API key required' });
    return;
  }
  log.verbose(`Settings: testing Radarr connection to ${url}`);
  const ok = await radarrService.testConnection(url, effectiveKey);
  log.info(`Settings: Radarr connection test ${ok ? 'succeeded' : 'failed'}`);
  res.json({ success: ok });
});

router.post('/test/jellyseerr', async (req, res) => {
  const { url, apiKey } = req.body;
  const effectiveKey = apiKey || getConfig().jellyseerrApiKey;
  if (!url || !effectiveKey) {
    res.status(400).json({ error: 'URL and API key required' });
    return;
  }
  log.verbose(`Settings: testing Jellyseerr connection to ${url}`);
  const ok = await jellyseerrService.testConnection(url, effectiveKey);
  log.info(`Settings: Jellyseerr connection test ${ok ? 'succeeded' : 'failed'}`);
  res.json({ success: ok });
});

router.post('/test/plex', async (req, res) => {
  const { apiKey } = req.body;
  const effectiveKey = apiKey || getConfig().plexToken;
  if (!effectiveKey) {
    res.status(400).json({ error: 'Token required' });
    return;
  }
  log.verbose('Settings: testing Plex connection');
  const ok = await plexService.testConnection(effectiveKey);
  log.info(`Settings: Plex connection test ${ok ? 'succeeded' : 'failed'}`);
  res.json({ success: ok });
});

export default router;
