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

// POST /api/plex/signin — get token via Plex credentials
router.post('/signin', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  try {
    const token = await plexService.signIn(username, password);
    res.json({ token });
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401) {
      res.status(401).json({ error: 'Invalid Plex credentials' });
    } else {
      console.error('[ERROR] Plex sign-in failed:', err);
      res.status(502).json({ error: 'Plex sign-in failed' });
    }
  }
});

export default router;
