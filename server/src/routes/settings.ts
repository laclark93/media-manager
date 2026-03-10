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
    sonarrUrl: config.sonarrUrl,
    sonarrApiKeySet: !!config.sonarrApiKey,
    sonarrAnimeTag: config.sonarrAnimeTag,
    radarrUrl: config.radarrUrl,
    radarrApiKeySet: !!config.radarrApiKey,
    radarrAnimeTag: config.radarrAnimeTag,
    jellyseerrUrl: config.jellyseerrUrl,
    jellyseerrApiKeySet: !!config.jellyseerrApiKey,
    stalenessThresholds: config.stalenessThresholds,
    sonarrConfigured: !!(config.sonarrUrl && config.sonarrApiKey),
    radarrConfigured: !!(config.radarrUrl && config.radarrApiKey),
    jellyseerrConfigured: !!(config.jellyseerrUrl && config.jellyseerrApiKey),
    plexTokenSet: !!config.plexToken,
    plexConfigured: !!config.plexToken,
  });
});

router.put('/', (req, res) => {
  const { sonarrUrl, sonarrApiKey, sonarrAnimeTag, radarrUrl, radarrApiKey, radarrAnimeTag, jellyseerrUrl, jellyseerrApiKey, plexToken, stalenessThresholds } = req.body as Settings;
  const current = readSettings();
  const updated: Settings = {
    ...current,
    sonarrUrl: sonarrUrl ?? current.sonarrUrl,
    // Only update API keys when a non-empty value is provided; empty means "keep existing"
    sonarrApiKey: sonarrApiKey || current.sonarrApiKey,
    sonarrAnimeTag: sonarrAnimeTag ?? current.sonarrAnimeTag,
    radarrUrl: radarrUrl ?? current.radarrUrl,
    radarrApiKey: radarrApiKey || current.radarrApiKey,
    radarrAnimeTag: radarrAnimeTag ?? current.radarrAnimeTag,
    jellyseerrUrl: jellyseerrUrl ?? current.jellyseerrUrl,
    jellyseerrApiKey: jellyseerrApiKey || current.jellyseerrApiKey,
    plexToken: plexToken || current.plexToken,
    stalenessThresholds: stalenessThresholds ?? current.stalenessThresholds,
  };
  writeSettings(updated);
  log.info('Settings: configuration updated');
  log.verbose(`Settings: updated keys — ${Object.keys(req.body).join(', ')}`);
  res.json({ success: true });
});

router.post('/test/sonarr', async (req, res) => {
  const { url, apiKey } = req.body;
  const effectiveKey = apiKey || getConfig().sonarrApiKey;
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
  const effectiveKey = apiKey || getConfig().radarrApiKey;
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
