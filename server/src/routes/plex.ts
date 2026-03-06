import { Router } from 'express';
import { getConfig } from '../config.js';
import * as plexService from '../services/plex.js';

const router = Router();

// GET /api/plex/web-url?title=...&year=...&type=show|movie
router.get('/web-url', async (req, res) => {
  const config = getConfig();
  if (!config.plexToken) {
    res.status(400).json({ error: 'Plex not configured' });
    return;
  }

  const { title, year, type } = req.query as { title: string; year?: string; type: string };
  if (!title || !type) {
    res.status(400).json({ error: 'title and type are required' });
    return;
  }

  try {
    const server = await plexService.discoverServer(config.plexToken);
    const results = await plexService.search(config.plexToken, title, type as 'movie' | 'show');

    if (results.length === 0) {
      res.json({ url: null });
      return;
    }

    const yearNum = year ? parseInt(year) : null;
    const match = (yearNum ? results.find(r => r.year === yearNum) : null) || results[0];
    const url = plexService.buildWebUrl(server.machineIdentifier, match.ratingKey);
    res.json({ url });
  } catch (err) {
    console.error('[ERROR] Plex web-url lookup failed:', err);
    res.status(502).json({ error: 'Plex lookup failed' });
  }
});

// GET /api/plex/episode-urls?title=...&year=...&type=show|movie
// Returns show-level URL + per-episode URLs keyed by "S##E##"
router.get('/episode-urls', async (req, res) => {
  const config = getConfig();
  if (!config.plexToken) {
    res.status(400).json({ error: 'Plex not configured' });
    return;
  }

  const { title, year, type } = req.query as { title: string; year?: string; type: string };
  if (!title || !type) {
    res.status(400).json({ error: 'title and type are required' });
    return;
  }

  try {
    const server = await plexService.discoverServer(config.plexToken);
    const results = await plexService.search(config.plexToken, title, type as 'movie' | 'show');

    if (results.length === 0) {
      res.json({ showUrl: null, episodes: {} });
      return;
    }

    const yearNum = year ? parseInt(year) : null;
    const match = (yearNum ? results.find(r => r.year === yearNum) : null) || results[0];
    const showUrl = plexService.buildWebUrl(server.machineIdentifier, match.ratingKey);

    if (type === 'movie') {
      res.json({ showUrl, episodes: {} });
      return;
    }

    // For shows, get all episodes and build per-episode URLs
    const plexEpisodes = await plexService.getShowEpisodes(config.plexToken, match.ratingKey);
    const episodes: Record<string, string> = {};
    for (const ep of plexEpisodes) {
      const key = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
      episodes[key] = plexService.buildWebUrl(server.machineIdentifier, ep.ratingKey);
    }

    res.json({ showUrl, episodes });
  } catch (err) {
    console.error('[ERROR] Plex episode-urls lookup failed:', err);
    res.status(502).json({ error: 'Plex lookup failed' });
  }
});

// GET /api/plex/subtitle-streams?title=...&year=...&type=show|movie&episodes=S01E01,S01E02
// Returns subtitle streams per episode key (shows) or { movie: [...] } (movies)
router.get('/subtitle-streams', async (req, res) => {
  const config = getConfig();
  if (!config.plexToken) {
    res.status(400).json({ error: 'Plex not configured' });
    return;
  }

  const { title, year, type, episodes } = req.query as {
    title: string; year?: string; type: string; episodes?: string;
  };
  if (!title || !type) {
    res.status(400).json({ error: 'title and type are required' });
    return;
  }

  try {
    const server = await plexService.discoverServer(config.plexToken);
    const results = await plexService.search(config.plexToken, title, type as 'movie' | 'show');

    if (results.length === 0) {
      res.json({});
      return;
    }

    const yearNum = year ? parseInt(year) : null;
    const match = (yearNum ? results.find(r => r.year === yearNum) : null) ?? results[0];

    if (type === 'movie') {
      const streams = await plexService.getItemStreams(config.plexToken, match.ratingKey);
      res.json({ movie: streams });
      return;
    }

    // For shows: get all episodes, filter to requested keys, fetch streams in parallel
    const requestedKeys = episodes ? new Set(episodes.split(',')) : null;
    const plexEpisodes = await plexService.getShowEpisodes(config.plexToken, match.ratingKey);

    const targets = requestedKeys
      ? plexEpisodes.filter(ep => {
          const key = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
          return requestedKeys.has(key);
        })
      : plexEpisodes;

    const streamResults = await Promise.allSettled(
      targets.map(ep => plexService.getItemStreams(config.plexToken, ep.ratingKey))
    );

    const subtitleMap: Record<string, plexService.SubtitleStream[]> = {};
    targets.forEach((ep, i) => {
      const key = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
      const result = streamResults[i];
      if (result.status === 'fulfilled') {
        subtitleMap[key] = result.value;
      }
    });

    res.json({ machineIdentifier: server.machineIdentifier, episodes: subtitleMap });
  } catch (err) {
    console.error('[ERROR] Plex subtitle-streams failed:', err);
    res.status(502).json({ error: 'Plex lookup failed' });
  }
});

// POST /api/plex/auth/pin — create a Plex PIN for OAuth popup flow
router.post('/auth/pin', async (_req, res) => {
  try {
    const pin = await plexService.createPin();
    res.json(pin);
  } catch (err) {
    console.error('[ERROR] Plex PIN creation failed:', err);
    res.status(502).json({ error: 'Failed to create Plex PIN' });
  }
});

// GET /api/plex/auth/pin/:id — check if PIN has been claimed
router.get('/auth/pin/:id', async (req, res) => {
  const pinId = parseInt(req.params.id);
  if (isNaN(pinId)) {
    res.status(400).json({ error: 'Invalid PIN ID' });
    return;
  }
  try {
    const token = await plexService.checkPin(pinId);
    res.json({ token });
  } catch (err) {
    console.error('[ERROR] Plex PIN check failed:', err);
    res.status(502).json({ error: 'Failed to check Plex PIN' });
  }
});

export default router;
