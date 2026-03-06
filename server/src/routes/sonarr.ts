import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getConfig } from '../config.js';
import * as sonarrService from '../services/sonarr.js';

const router = Router();

/** Returns true if a single subtitle token represents English */
function isEnglishToken(token: string): boolean {
  const t = token.toLowerCase().trim();
  if (t === '' || t === 'und') return true; // empty or undetermined → assume English
  if (t === 'english' || t === 'eng' || t === 'en') return true; // full name + ISO 639-1/2
  if (/^en-[a-z]{2,3}$/.test(t)) return true; // BCP-47: en-US, en-GB, en-AU, etc.
  if (/^english\s*\(/.test(t)) return true; // "English (US)", "English (SDH)", "English (United Kingdom)"
  return false;
}

/** Returns true if the subtitle string contains English or is empty (assume English if unnamed) */
function hasEnglishSubs(subtitles: string | undefined): boolean {
  if (!subtitles || subtitles.trim() === '') return true;
  return subtitles.split('/').some(s => isEnglishToken(s.trim()));
}


router.get('/series', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.sonarrUrl || !config.sonarrApiKey) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const allSeries = await sonarrService.getSeries(config.sonarrUrl, config.sonarrApiKey);
    const missingSeries = allSeries.filter(
      (s) => s.monitored && s.statistics && s.statistics.episodeCount > s.statistics.episodeFileCount
    );
    res.json(missingSeries);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/episodes', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const seriesId = parseInt(req.query.seriesId as string);
    if (isNaN(seriesId)) {
      res.status(400).json({ error: 'seriesId required' });
      return;
    }
    const episodes = await sonarrService.getEpisodes(config.sonarrUrl, config.sonarrApiKey, seriesId);
    const missing = episodes.filter(
      (ep) => !ep.hasFile && ep.monitored && ep.airDateUtc && new Date(ep.airDateUtc) < new Date()
    );
    res.json(missing);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/search/series', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const { seriesId } = req.body;
    const result = await sonarrService.searchSeries(config.sonarrUrl, config.sonarrApiKey, seriesId);
    res.json(result);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/search/episodes', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const { episodeIds } = req.body;
    const result = await sonarrService.searchEpisodes(config.sonarrUrl, config.sonarrApiKey, episodeIds);
    res.json(result);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/anime-check', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.sonarrUrl || !config.sonarrApiKey) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const [allSeries, tags] = await Promise.all([
      sonarrService.getSeries(config.sonarrUrl, config.sonarrApiKey),
      sonarrService.getTags(config.sonarrUrl, config.sonarrApiKey),
    ]);
    const animeTagId = tags.find(t => t.label.toLowerCase() === 'anime')?.id;
    const mismatches = allSeries
      .filter(s => s.monitored && s.statistics && s.statistics.episodeCount > s.statistics.episodeFileCount)
      .map(s => {
        const isAnimeSeries = s.seriesType === 'anime';
        const hasAnimeTag = animeTagId !== undefined && s.tags.includes(animeTagId);
        if (isAnimeSeries === hasAnimeTag) return null;
        const poster = s.images.find(i => i.coverType === 'poster');
        return {
          id: s.id,
          title: s.title,
          year: s.year,
          service: 'sonarr' as const,
          mismatchType: isAnimeSeries ? 'anime-not-tagged' : 'tagged-not-anime',
          seriesType: s.seriesType,
          genres: s.genres,
          slug: s.titleSlug,
          posterUrl: poster ? `/api/sonarr/image${poster.url}` : undefined,
          remotePosterUrl: poster?.remoteUrl,
        };
      })
      .filter(Boolean);
    res.json(mismatches);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/subtitle-check', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.sonarrUrl || !config.sonarrApiKey) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const [allSeries, tags] = await Promise.all([
      sonarrService.getSeries(config.sonarrUrl, config.sonarrApiKey),
      sonarrService.getTags(config.sonarrUrl, config.sonarrApiKey),
    ]);
    const animeTagId = tags.find(t => t.label.toLowerCase() === 'anime')?.id;

    const animeSeries = allSeries.filter(s => {
      const isAnimeSeries = s.seriesType === 'anime';
      const hasAnimeTag = animeTagId !== undefined && s.tags.includes(animeTagId);
      return (isAnimeSeries || hasAnimeTag) && s.statistics && s.statistics.episodeFileCount > 0;
    });

    // Fetch episode files AND episodes in parallel for all anime series
    const results = await Promise.allSettled(
      animeSeries.map(s => Promise.all([
        sonarrService.getEpisodeFiles(config.sonarrUrl, config.sonarrApiKey, s.id),
        sonarrService.getEpisodes(config.sonarrUrl, config.sonarrApiKey, s.id),
      ]))
    );

    const missing: object[] = [];
    animeSeries.forEach((s, i) => {
      const result = results[i];
      if (result.status !== 'fulfilled') return;
      const [files, episodes] = result.value;

      // Map episodeFileId → episode for quick lookup
      const fileToEpisode = new Map(
        episodes.filter(e => e.episodeFileId).map(e => [e.episodeFileId!, e])
      );

      // Flag files where: (a) no subtitle tracks at all (anime should always have subs), OR
      // (b) subtitle tracks exist but none are English (unnamed tracks assumed English)
      const missingEngSubs = files.filter(f => {
        const subs = f.mediaInfo?.subtitles?.trim();
        if (!subs) return true; // no subtitles at all → flag
        return !hasEnglishSubs(subs); // has subtitles → check for English
      });
      if (missingEngSubs.length === 0) return;

      const affectedEpisodes = missingEngSubs.map(f => {
        const ep = fileToEpisode.get(f.id);
        const subtitleLabel = f.mediaInfo?.subtitles?.trim() || 'No subtitles';
        return {
          fileId: f.id,
          episodeId: ep?.id ?? null,
          seasonNumber: f.seasonNumber,
          episodeNumber: ep?.episodeNumber ?? null,
          title: ep?.title ?? null,
          subtitles: subtitleLabel,
        };
      });

      const poster = s.images.find(img => img.coverType === 'poster');
      missing.push({
        id: s.id,
        title: s.title,
        year: s.year,
        service: 'sonarr',
        affectedFiles: missingEngSubs.length,
        totalFiles: files.length,
        foundSubtitles: [...new Set(missingEngSubs.map(f => f.mediaInfo?.subtitles?.trim() || 'No subtitles'))].join(', '),
        affectedEpisodes,
        slug: s.titleSlug,
        posterUrl: poster ? `/api/sonarr/image${poster.url}` : undefined,
        remotePosterUrl: poster?.remoteUrl,
      });
    });

    res.json(missing);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/mark-failed', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.sonarrUrl || !config.sonarrApiKey) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const { seriesId, episodeFileId, episodeId } = req.body as {
      seriesId: number;
      episodeFileId: number;
      episodeId: number | null;
    };
    if (!seriesId || !episodeFileId) {
      res.status(400).json({ error: 'seriesId and episodeFileId are required' });
      return;
    }

    // 1. Try to blocklist via history (non-fatal if not found)
    if (episodeId) {
      try {
        const history = await sonarrService.getSeriesHistory(config.sonarrUrl, config.sonarrApiKey, seriesId);
        const grabRecord = history
          .filter(h => h.episodeId === episodeId && h.eventType === 'grabbed')
          .sort((a, b) => b.id - a.id)[0]; // most recent grab
        if (grabRecord) {
          await sonarrService.markHistoryFailed(config.sonarrUrl, config.sonarrApiKey, grabRecord.id);
          console.log(`[INFO] Marked history ${grabRecord.id} as failed for episode ${episodeId}`);
        } else {
          console.log(`[WARN] No grab history found for episode ${episodeId} — skipping blocklist`);
        }
      } catch (err) {
        console.log(`[WARN] Could not blocklist episode ${episodeId}:`, err instanceof Error ? err.message : err);
      }
    }

    // 2. Delete the episode file
    await sonarrService.deleteEpisodeFile(config.sonarrUrl, config.sonarrApiKey, episodeFileId);
    console.log(`[INFO] Deleted episode file ${episodeFileId}`);

    // 3. Search for a replacement
    if (episodeId) {
      await sonarrService.searchEpisodes(config.sonarrUrl, config.sonarrApiKey, [episodeId]);
      console.log(`[INFO] Triggered EpisodeSearch for episode ${episodeId}`);
    }

    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// POST /api/sonarr/mark-episode-failed — lookup episode by season/episode, mark failed, delete, search
router.post('/mark-episode-failed', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.sonarrUrl || !config.sonarrApiKey) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const { seriesId, seasonNumber, episodeNumber } = req.body as {
      seriesId: number;
      seasonNumber?: number;
      episodeNumber?: number;
    };
    if (!seriesId) {
      res.status(400).json({ error: 'seriesId is required' });
      return;
    }

    // Find matching episodes with files
    const episodes = await sonarrService.getEpisodes(config.sonarrUrl, config.sonarrApiKey, seriesId);
    let targets = episodes.filter(ep => ep.hasFile && ep.episodeFileId);
    if (seasonNumber != null) targets = targets.filter(ep => ep.seasonNumber === seasonNumber);
    if (episodeNumber != null) targets = targets.filter(ep => ep.episodeNumber === episodeNumber);

    if (targets.length === 0) {
      res.status(404).json({ error: 'No matching episode files found' });
      return;
    }

    // Get history for blocklisting
    const history = await sonarrService.getSeriesHistory(config.sonarrUrl, config.sonarrApiKey, seriesId);
    let blocklisted = 0;
    let deleted = 0;

    for (const ep of targets) {
      // Blocklist via history
      const grabRecord = history
        .filter(h => h.episodeId === ep.id && h.eventType === 'grabbed')
        .sort((a, b) => b.id - a.id)[0];
      if (grabRecord) {
        try {
          await sonarrService.markHistoryFailed(config.sonarrUrl, config.sonarrApiKey, grabRecord.id);
          blocklisted++;
          console.log(`[INFO] Marked history ${grabRecord.id} as failed for episode ${ep.id}`);
        } catch (err) {
          console.log(`[WARN] Could not blocklist episode ${ep.id}:`, err instanceof Error ? err.message : err);
        }
      }

      // Delete the file
      try {
        await sonarrService.deleteEpisodeFile(config.sonarrUrl, config.sonarrApiKey, ep.episodeFileId!);
        deleted++;
        console.log(`[INFO] Deleted episode file ${ep.episodeFileId}`);
      } catch (err) {
        console.log(`[WARN] Could not delete episode file ${ep.episodeFileId}:`, err instanceof Error ? err.message : err);
      }
    }

    // Search for replacements
    const episodeIds = targets.map(ep => ep.id);
    await sonarrService.searchEpisodes(config.sonarrUrl, config.sonarrApiKey, episodeIds);
    console.log(`[INFO] Triggered EpisodeSearch for ${episodeIds.length} episodes`);

    res.json({ success: true, blocklisted, deleted, searched: episodeIds.length });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/image/*', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const imagePath = (req.params as Record<string, string>)[0];
    const response = await sonarrService.proxyImage(config.sonarrUrl, config.sonarrApiKey, imagePath);
    if (response.headers['content-type']) {
      res.setHeader('content-type', response.headers['content-type']);
    }
    res.setHeader('cache-control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Image not found' });
  }
});

export default router;
