import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getConfig } from '../config.js';
import * as radarrService from '../services/radarr.js';
import * as plexService from '../services/plex.js';

const router = Router();

/** Returns true if a subtitle token can be positively identified as a non-English language */
function isDefinitelyNonEnglish(token: string): boolean {
  const t = token.toLowerCase().trim();
  // Empty, undetermined, or any unrecognized value → cannot confirm non-English, assume English
  if (!t || t === 'und' || t === 'unknown' || t === 'zxx') return false;
  // Known English variants → not non-English
  if (t === 'english' || t === 'eng' || t === 'en') return false;
  if (/^en(-[a-z]{2,4})?$/.test(t)) return false; // en, en-US, en-GB, en-AU, etc.
  if (/^english\s*\(/.test(t)) return false; // "English (US)", "English (SDH)", etc.
  // Anything else is treated as a specific non-English language
  return true;
}

/** Returns true if the subtitle string contains English, is empty, or has any unrecognized track (assume English) */
function hasEnglishSubs(subtitles: string | undefined): boolean {
  if (!subtitles || subtitles.trim() === '') return true;
  const tokens = subtitles.split('/').map(s => s.trim());
  // Only flag if ALL tokens are positively identified as non-English
  return !tokens.every(t => isDefinitelyNonEnglish(t));
}


router.get('/movies', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.radarrUrl || !config.radarrApiKey) {
      res.status(400).json({ error: 'Radarr not configured' });
      return;
    }
    const allMovies = await radarrService.getMovies(config.radarrUrl, config.radarrApiKey);
    const missingMovies = allMovies.filter((m) => m.monitored && !m.hasFile);
    console.log(`[INFO] Radarr movies: ${missingMovies.length} missing (of ${allMovies.length} total)`);
    res.json(missingMovies);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/search', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const { movieId } = req.body;
    const result = await radarrService.searchMovie(config.radarrUrl, config.radarrApiKey, [movieId]);
    res.json(result);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/anime-check', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.radarrUrl || !config.radarrApiKey) {
      res.status(400).json({ error: 'Radarr not configured' });
      return;
    }
    const [allMovies, tags] = await Promise.all([
      radarrService.getMovies(config.radarrUrl, config.radarrApiKey),
      radarrService.getTags(config.radarrUrl, config.radarrApiKey),
    ]);
    const animeTagId = tags.find(t => t.label.toLowerCase() === 'anime')?.id;
    const mismatches = allMovies
      .filter(m => m.monitored && !m.hasFile)
      .map(m => {
        // Anime signal: Animation genre + Japanese original language
        const isAnimeMovie =
          m.genres.some(g => g.toLowerCase() === 'animation') &&
          m.originalLanguage?.name?.toLowerCase() === 'japanese';
        const hasAnimeTag = animeTagId !== undefined && m.tags.includes(animeTagId);
        if (isAnimeMovie === hasAnimeTag) return null;
        const poster = m.images.find(i => i.coverType === 'poster');
        return {
          id: m.id,
          title: m.title,
          year: m.year,
          service: 'radarr' as const,
          mismatchType: isAnimeMovie ? 'anime-not-tagged' : 'tagged-not-anime',
          genres: m.genres,
          originalLanguage: m.originalLanguage?.name,
          slug: m.titleSlug,
          posterUrl: poster ? `/api/radarr/image${poster.url}` : undefined,
          remotePosterUrl: poster?.remoteUrl,
        };
      })
      .filter(Boolean);
    console.log(`[INFO] Radarr anime-check: ${mismatches.length} mismatch(es) found`);
    res.json(mismatches);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/subtitle-check', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.radarrUrl || !config.radarrApiKey) {
      res.status(400).json({ error: 'Radarr not configured' });
      return;
    }
    const [allMovies, tags] = await Promise.all([
      radarrService.getMovies(config.radarrUrl, config.radarrApiKey),
      radarrService.getTags(config.radarrUrl, config.radarrApiKey),
    ]);
    const animeTagId = tags.find(t => t.label.toLowerCase() === 'anime')?.id;

    // Anime movies that have a file
    const animeMovies = allMovies.filter(m => {
      const isAnimeMovie =
        m.genres.some(g => g.toLowerCase() === 'animation') &&
        m.originalLanguage?.name?.toLowerCase() === 'japanese';
      const hasAnimeTag = animeTagId !== undefined && m.tags.includes(animeTagId);
      return (isAnimeMovie || hasAnimeTag) && m.hasFile;
    });

    // Fetch movie files for all anime movies in parallel
    const fileResults = await Promise.allSettled(
      animeMovies.map(m => radarrService.getMovieFiles(config.radarrUrl, config.radarrApiKey, m.id))
    );

    let missing: any[] = [];
    animeMovies.forEach((m, i) => {
      const result = fileResults[i];
      if (result.status !== 'fulfilled') return;
      const files = result.value;
      // Flag files where: (a) no subtitle tracks at all (anime should always have subs), OR
      // (b) subtitle tracks exist but none are English (unnamed tracks assumed English)
      const missingEngSubs = files.filter(f => {
        const subs = f.mediaInfo?.subtitles?.trim();
        if (!subs) return true; // no subtitles at all → flag
        return !hasEnglishSubs(subs); // has subtitles → check for English
      });
      if (missingEngSubs.length === 0) return;
      const poster = m.images.find(img => img.coverType === 'poster');
      missing.push({
        id: m.id,
        title: m.title,
        year: m.year,
        service: 'radarr',
        affectedFiles: missingEngSubs.length,
        totalFiles: files.length,
        foundSubtitles: [...new Set(missingEngSubs.map(f => f.mediaInfo?.subtitles?.trim() || 'No subtitles'))].join(', '),
        affectedFileIds: missingEngSubs.map(f => f.id),
        slug: m.titleSlug,
        posterUrl: poster ? `/api/radarr/image${poster.url}` : undefined,
        remotePosterUrl: poster?.remoteUrl,
      });
    });

    // Plex cross-reference: filter out false positives caused by external subtitle files
    // (Plex indexes external .ass/.srt files as subtitle streams; Sonarr mediaInfo does not)
    if (config.plexToken && missing.length > 0) {
      const plexResults = await Promise.allSettled(
        missing.map(async (item) => {
          try {
            const results = await plexService.search(config.plexToken, item.title, 'movie');
            if (results.length === 0) return item;
            const match = results.find((r: any) => r.year === item.year) ?? results[0];
            const streams = await plexService.getItemStreams(config.plexToken, match.ratingKey, `"${item.title}"`);
            const hasEngSub = streams.some(s => {
              const code = s.languageCode?.toLowerCase()?.trim();
              const lang = s.language?.toLowerCase()?.trim();
              if (!code && !lang) return true; // no language info → assume English
              return code === 'en' || code === 'eng' || lang === 'english';
            });
            if (hasEngSub) {
              console.log(`[INFO] Radarr subtitle-check: Plex confirmed English subs for "${item.title}" — removing false positive`);
              return null;
            }
            return item;
          } catch {
            return item; // Plex lookup failed, keep original
          }
        })
      );
      missing = plexResults
        .map(r => r.status === 'fulfilled' ? r.value : null)
        .filter((item): item is any => item != null);
    }

    console.log(`[INFO] Radarr subtitle-check: ${missing.length} movie(s) with missing English subs (of ${animeMovies.length} anime movies checked)`);
    res.json(missing);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/mark-failed', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.radarrUrl || !config.radarrApiKey) {
      res.status(400).json({ error: 'Radarr not configured' });
      return;
    }
    const { movieId, movieFileId } = req.body as { movieId: number; movieFileId: number };
    if (!movieId || !movieFileId) {
      res.status(400).json({ error: 'movieId and movieFileId are required' });
      return;
    }

    // 1. Try to blocklist via history (non-fatal if not found)
    try {
      const history = await radarrService.getMovieHistory(config.radarrUrl, config.radarrApiKey, movieId);
      const grabRecord = history
        .filter(h => h.eventType === 'grabbed')
        .sort((a, b) => b.id - a.id)[0];
      if (grabRecord) {
        await radarrService.markHistoryFailed(config.radarrUrl, config.radarrApiKey, grabRecord.id);
        console.log(`[INFO] Marked history ${grabRecord.id} as failed for movie ${movieId}`);
      } else {
        console.log(`[WARN] No grab history found for movie ${movieId} — skipping blocklist`);
      }
    } catch (err) {
      console.log(`[WARN] Could not blocklist movie ${movieId}:`, err instanceof Error ? err.message : err);
    }

    // 2. Delete the movie file
    await radarrService.deleteMovieFile(config.radarrUrl, config.radarrApiKey, movieFileId);
    console.log(`[INFO] Deleted movie file ${movieFileId}`);

    // 3. Search for a replacement
    await radarrService.searchMovie(config.radarrUrl, config.radarrApiKey, [movieId]);
    console.log(`[INFO] Triggered MoviesSearch for movie ${movieId}`);

    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// POST /api/radarr/mark-movie-failed — lookup movie files, mark failed, delete, search
router.post('/mark-movie-failed', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.radarrUrl || !config.radarrApiKey) {
      res.status(400).json({ error: 'Radarr not configured' });
      return;
    }
    const { movieId } = req.body as { movieId: number };
    if (!movieId) {
      res.status(400).json({ error: 'movieId is required' });
      return;
    }

    const files = await radarrService.getMovieFiles(config.radarrUrl, config.radarrApiKey, movieId);
    if (files.length === 0) {
      res.status(404).json({ error: 'No movie files found' });
      return;
    }

    // Blocklist via history
    const history = await radarrService.getMovieHistory(config.radarrUrl, config.radarrApiKey, movieId);
    const grabRecord = history
      .filter(h => h.eventType === 'grabbed')
      .sort((a, b) => b.id - a.id)[0];
    if (grabRecord) {
      try {
        await radarrService.markHistoryFailed(config.radarrUrl, config.radarrApiKey, grabRecord.id);
        console.log(`[INFO] Marked history ${grabRecord.id} as failed for movie ${movieId}`);
      } catch (err) {
        console.log(`[WARN] Could not blocklist movie ${movieId}:`, err instanceof Error ? err.message : err);
      }
    }

    // Delete all movie files
    for (const f of files) {
      await radarrService.deleteMovieFile(config.radarrUrl, config.radarrApiKey, f.id);
      console.log(`[INFO] Deleted movie file ${f.id}`);
    }

    // Search for replacement
    await radarrService.searchMovie(config.radarrUrl, config.radarrApiKey, [movieId]);
    console.log(`[INFO] Triggered MoviesSearch for movie ${movieId}`);

    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/early', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.radarrUrl || !config.radarrApiKey) {
      res.status(400).json({ error: 'Radarr not configured' });
      return;
    }
    const now = new Date();
    const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour grace period
    const allMovies = await radarrService.getMovies(config.radarrUrl, config.radarrApiKey);

    // Movies that have a file but haven't been released to home video yet
    const earlyMovies = allMovies.filter(m => {
      if (!m.hasFile || m.status === 'released') return false;
      // Flag if at least one home release date exists and is more than 24h away, or no home release dates at all
      const digitalFuture = m.digitalRelease && new Date(m.digitalRelease) > threshold;
      const physicalFuture = m.physicalRelease && new Date(m.physicalRelease) > threshold;
      const noHomeRelease = !m.digitalRelease && !m.physicalRelease;
      return digitalFuture || physicalFuture || noHomeRelease;
    });

    if (earlyMovies.length === 0) {
      res.json([]);
      return;
    }

    // Fetch movie files to get file IDs
    const fileResults = await Promise.allSettled(
      earlyMovies.map(m => radarrService.getMovieFiles(config.radarrUrl, config.radarrApiKey, m.id))
    );

    const early: object[] = [];
    earlyMovies.forEach((m, i) => {
      const result = fileResults[i];
      const files = result.status === 'fulfilled' ? result.value : [];
      const fileId = files[0]?.id ?? null;
      const poster = m.images.find(img => img.coverType === 'poster');
      early.push({
        id: m.id,
        fileId,
        title: m.title,
        year: m.year,
        slug: m.titleSlug,
        service: 'radarr',
        status: m.status,
        digitalRelease: m.digitalRelease,
        physicalRelease: m.physicalRelease,
        inCinemas: m.inCinemas,
        posterUrl: poster ? `/api/radarr/image${poster.url}` : undefined,
        remotePosterUrl: poster?.remoteUrl,
      });
    });

    console.log(`[INFO] Radarr early: ${early.length} movie(s) with pre-release files`);
    res.json(early);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.delete('/movie-file/:fileId', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.radarrUrl || !config.radarrApiKey) {
      res.status(400).json({ error: 'Radarr not configured' });
      return;
    }
    const fileId = Number.parseInt(req.params['fileId'] as string);
    if (Number.isNaN(fileId)) {
      res.status(400).json({ error: 'Invalid fileId' });
      return;
    }
    await radarrService.deleteMovieFile(config.radarrUrl, config.radarrApiKey, fileId);
    console.log(`[INFO] Radarr: deleted movie file ${fileId}`);
    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/image/*', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const imagePath = (req.params as Record<string, string>)[0];
    const response = await radarrService.proxyImage(config.radarrUrl, config.radarrApiKey, imagePath);
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
