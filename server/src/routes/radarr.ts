import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getConfig, findRadarrInstance } from '../config.js';
import * as log from '../logger.js';
import * as radarrService from '../services/radarr.js';
import * as plexService from '../services/plex.js';
import { ServiceInstance } from '../types/index.js';

const router = Router();

function isDefinitelyNonEnglish(token: string): boolean {
  const t = token.toLowerCase().trim();
  if (!t || t === 'und' || t === 'unknown' || t === 'zxx') return false;
  if (t === 'english' || t === 'eng' || t === 'en') return false;
  if (/^en(-[a-z]{2,4})?$/.test(t)) return false;
  if (/^english\s*\(/.test(t)) return false;
  return true;
}

function hasEnglishSubs(subtitles: string | undefined): boolean {
  if (!subtitles || subtitles.trim() === '') return true;
  const tokens = subtitles.split('/').map(s => s.trim());
  return !tokens.every(t => isDefinitelyNonEnglish(t));
}

function getInstances(): ServiceInstance[] {
  return getConfig().radarrInstances.filter(i => i.url && i.apiKey);
}

function resolveInstance(instanceUrl?: string): ServiceInstance | null {
  const config = getConfig();
  if (instanceUrl) {
    const inst = findRadarrInstance(config, instanceUrl);
    if (inst) return inst;
  }
  const instances = config.radarrInstances.filter(i => i.url && i.apiKey);
  return instances[0] ?? null;
}


router.get('/movies', async (_req: Request, res: Response) => {
  try {
    const instances = getInstances();
    if (instances.length === 0) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    const allResults = await Promise.all(instances.map(async (inst, idx) => {
      log.verbose(`Radarr [${inst.name}]: fetching missing movies`);
      const allMovies = await radarrService.getMovies(inst.url, inst.apiKey);
      const missingMovies = allMovies.filter((m) => m.monitored && !m.hasFile && m.isAvailable);
      log.info(`Radarr [${inst.name}]: ${missingMovies.length} missing (of ${allMovies.length} total)`);
      return missingMovies.map(m => ({
        ...m,
        instanceUrl: inst.url,
        instanceName: inst.name,
        images: m.images.map(img => ({
          ...img,
          url: img.url ? `/api/radarr/image/${idx}${img.url}` : img.url,
        })),
      }));
    }));
    res.json(allResults.flat());
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/search', async (req: Request, res: Response) => {
  try {
    const { movieId, instanceUrl } = req.body;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    log.verbose(`Radarr [${inst.name}] route: search for movieId=${movieId}`);
    const result = await radarrService.searchMovie(inst.url, inst.apiKey, [movieId]);
    res.json(result);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/anime-check', async (_req: Request, res: Response) => {
  try {
    log.verbose('Radarr route: anime-check starting');
    const instances = getInstances();
    if (instances.length === 0) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    const allResults = await Promise.all(instances.map(async (inst, idx) => {
      const [allMovies, tags, rootFolders] = await Promise.all([
        radarrService.getMovies(inst.url, inst.apiKey),
        radarrService.getTags(inst.url, inst.apiKey),
        radarrService.getRootFolders(inst.url, inst.apiKey),
      ]);
      const animeTagId = tags.find(t => t.label.toLowerCase() === inst.animeTag.toLowerCase())?.id;
      const animeRootPaths = rootFolders.filter(rf => rf.path.toLowerCase().includes('anime')).map(rf => rf.path);
      const isInAnimeDir = (p: string) => animeRootPaths.some(rp => p.startsWith(rp));
      const mismatches: any[] = [];
      for (const m of allMovies) {
        if (!m.monitored) continue;
        const isAnimeMovie = m.genres.some(g => g.toLowerCase() === 'animation') && m.originalLanguage?.name?.toLowerCase() === 'japanese';
        const hasAnimeTag = animeTagId !== undefined && m.tags.includes(animeTagId);
        const inAnimeDir = isInAnimeDir(m.path);
        const poster = m.images.find(i => i.coverType === 'poster');
        const base = {
          id: m.id,
          title: m.title,
          year: m.year,
          service: 'radarr' as const,
          genres: m.genres,
          originalLanguage: m.originalLanguage?.name,
          slug: m.titleSlug,
          posterUrl: poster ? `/api/radarr/image/${idx}${poster.url}` : undefined,
          remotePosterUrl: poster?.remoteUrl,
          hasMissing: !m.hasFile,
          instanceUrl: inst.url,
          instanceName: inst.name,
        };
        if (isAnimeMovie !== hasAnimeTag) {
          mismatches.push({ ...base, mismatchType: isAnimeMovie ? 'anime-not-tagged' : 'tagged-not-anime' });
        }
        if ((isAnimeMovie || hasAnimeTag) && animeRootPaths.length > 0 && !inAnimeDir) {
          mismatches.push({ ...base, mismatchType: 'wrong-directory', currentPath: m.path });
        }
      }
      log.info(`Radarr [${inst.name}] anime-check: ${mismatches.length} mismatch(es) found`);
      return mismatches;
    }));
    res.json(allResults.flat());
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/add-anime-tag/:id', async (req: Request, res: Response) => {
  try {
    const movieId = parseInt(req.params.id as string, 10);
    const instanceUrl = req.body.instanceUrl as string | undefined;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    log.verbose(`Radarr [${inst.name}] route: add-anime-tag for movie ${movieId}`);
    const tags = await radarrService.getTags(inst.url, inst.apiKey);
    let animeTag = tags.find(t => t.label.toLowerCase() === inst.animeTag.toLowerCase());
    if (!animeTag) {
      animeTag = await radarrService.createTag(inst.url, inst.apiKey, inst.animeTag);
    }
    await radarrService.addTagToMovie(inst.url, inst.apiKey, movieId, animeTag.id);
    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/subtitle-check', async (_req: Request, res: Response) => {
  try {
    log.verbose('Radarr route: subtitle-check starting');
    const instances = getInstances();
    const config = getConfig();
    if (instances.length === 0) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    let allMissing: any[] = [];
    for (const [idx, inst] of instances.entries()) {
      const [allMovies, tags] = await Promise.all([
        radarrService.getMovies(inst.url, inst.apiKey),
        radarrService.getTags(inst.url, inst.apiKey),
      ]);
      const animeTagId = tags.find(t => t.label.toLowerCase() === inst.animeTag.toLowerCase())?.id;
      const animeMovies = allMovies.filter(m => {
        const isAnimeMovie = m.genres.some(g => g.toLowerCase() === 'animation') && m.originalLanguage?.name?.toLowerCase() === 'japanese';
        const hasAnimeTag = animeTagId !== undefined && m.tags.includes(animeTagId);
        return (isAnimeMovie || hasAnimeTag) && m.hasFile;
      });
      const fileResults = await Promise.allSettled(
        animeMovies.map(m => radarrService.getMovieFiles(inst.url, inst.apiKey, m.id))
      );
      let missing: any[] = [];
      animeMovies.forEach((m, i) => {
        const result = fileResults[i];
        if (result.status !== 'fulfilled') return;
        const files = result.value;
        const missingEngSubs = files.filter(f => {
          const subs = f.mediaInfo?.subtitles?.trim();
          if (!subs) return true;
          return !hasEnglishSubs(subs);
        });
        if (missingEngSubs.length === 0) return;
        const poster = m.images.find(img => img.coverType === 'poster');
        missing.push({
          id: m.id, title: m.title, year: m.year, service: 'radarr',
          affectedFiles: missingEngSubs.length, totalFiles: files.length,
          foundSubtitles: [...new Set(missingEngSubs.map(f => f.mediaInfo?.subtitles?.trim() || 'No subtitles'))].join(', '),
          affectedFileIds: missingEngSubs.map(f => f.id),
          filePaths: missingEngSubs.map(f => f.path).filter(Boolean),
          slug: m.titleSlug,
          posterUrl: poster ? `/api/radarr/image/${idx}${poster.url}` : undefined,
          remotePosterUrl: poster?.remoteUrl,
          instanceUrl: inst.url, instanceName: inst.name,
        });
      });

      // Plex cross-reference
      if (config.plexToken && missing.length > 0) {
        const plexResults = await Promise.allSettled(
          missing.map(async (item) => {
            try {
              const results = await plexService.search(config.plexToken, item.title, 'movie');
              let match: { ratingKey: string; title: string; year: number } | undefined;
              if (results.length === 0 && item.filePaths?.length > 0) {
                const pathMatch = await plexService.findMovieByFilePath(config.plexToken, item.filePaths);
                if (pathMatch) match = pathMatch;
              } else if (results.length > 0) {
                match = results.find((r: any) => r.year === item.year) ?? results[0];
              }
              if (!match) return item;
              const streams = await plexService.getItemStreams(config.plexToken, match.ratingKey, `"${item.title}"`);
              const hasEngSub = streams.some(s => {
                const code = s.languageCode?.toLowerCase()?.trim();
                const lang = s.language?.toLowerCase()?.trim();
                if (!code && !lang) return true;
                return code === 'en' || code === 'eng' || lang === 'english';
              });
              if (hasEngSub) return null;
              return item;
            } catch { return item; }
          })
        );
        missing = plexResults.map(r => r.status === 'fulfilled' ? r.value : null).filter((item): item is any => item != null);
      }

      log.info(`Radarr [${inst.name}] subtitle-check: ${missing.length} movie(s) with missing English subs`);
      allMissing.push(...missing);
    }
    res.json(allMissing);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/mark-failed', async (req: Request, res: Response) => {
  try {
    const { movieId, movieFileId, instanceUrl } = req.body;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    if (!movieId || !movieFileId) { res.status(400).json({ error: 'movieId and movieFileId are required' }); return; }
    try {
      const history = await radarrService.getMovieHistory(inst.url, inst.apiKey, movieId);
      const grabRecord = history.filter(h => h.eventType === 'grabbed').sort((a, b) => b.id - a.id)[0];
      if (grabRecord) await radarrService.markHistoryFailed(inst.url, inst.apiKey, grabRecord.id);
    } catch {}
    await radarrService.deleteMovieFile(inst.url, inst.apiKey, movieFileId);
    await radarrService.searchMovie(inst.url, inst.apiKey, [movieId]);
    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/mark-movie-failed', async (req: Request, res: Response) => {
  try {
    const { movieId, instanceUrl } = req.body;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    if (!movieId) { res.status(400).json({ error: 'movieId is required' }); return; }
    const files = await radarrService.getMovieFiles(inst.url, inst.apiKey, movieId);
    if (files.length === 0) { res.status(404).json({ error: 'No movie files found' }); return; }
    const history = await radarrService.getMovieHistory(inst.url, inst.apiKey, movieId);
    const grabRecord = history.filter(h => h.eventType === 'grabbed').sort((a, b) => b.id - a.id)[0];
    if (grabRecord) { try { await radarrService.markHistoryFailed(inst.url, inst.apiKey, grabRecord.id); } catch {} }
    for (const f of files) { await radarrService.deleteMovieFile(inst.url, inst.apiKey, f.id); }
    await radarrService.searchMovie(inst.url, inst.apiKey, [movieId]);
    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/early', async (_req: Request, res: Response) => {
  try {
    const instances = getInstances();
    if (instances.length === 0) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    const now = new Date();
    const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const allResults = await Promise.all(instances.map(async (inst, idx) => {
      const allMovies = await radarrService.getMovies(inst.url, inst.apiKey);
      const earlyMovies = allMovies.filter(m => {
        if (!m.hasFile || m.status === 'released') return false;
        const digitalFuture = m.digitalRelease && new Date(m.digitalRelease) > threshold;
        const physicalFuture = m.physicalRelease && new Date(m.physicalRelease) > threshold;
        const noHomeRelease = !m.digitalRelease && !m.physicalRelease;
        return digitalFuture || physicalFuture || noHomeRelease;
      });
      if (earlyMovies.length === 0) return [];
      const fileResults = await Promise.allSettled(
        earlyMovies.map(m => radarrService.getMovieFiles(inst.url, inst.apiKey, m.id))
      );
      const early: object[] = [];
      earlyMovies.forEach((m, i) => {
        const result = fileResults[i];
        const files = result.status === 'fulfilled' ? result.value : [];
        const poster = m.images.find(img => img.coverType === 'poster');
        early.push({
          id: m.id, fileId: files[0]?.id ?? null, title: m.title, year: m.year, slug: m.titleSlug,
          service: 'radarr', status: m.status,
          digitalRelease: m.digitalRelease, physicalRelease: m.physicalRelease, inCinemas: m.inCinemas,
          posterUrl: poster ? `/api/radarr/image/${idx}${poster.url}` : undefined,
          remotePosterUrl: poster?.remoteUrl,
          instanceUrl: inst.url, instanceName: inst.name,
        });
      });
      return early;
    }));
    res.json(allResults.flat());
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.delete('/movie-file/:fileId', async (req: Request, res: Response) => {
  try {
    const instanceUrl = req.query.instanceUrl as string | undefined;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    const fileId = Number.parseInt(req.params['fileId'] as string);
    if (Number.isNaN(fileId)) { res.status(400).json({ error: 'Invalid fileId' }); return; }
    await radarrService.deleteMovieFile(inst.url, inst.apiKey, fileId);
    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/image/:idx/*', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const idxStr = req.params.idx as string;
    const idx = parseInt(idxStr, 10);
    let inst: ServiceInstance | undefined;
    let imagePath: string;
    if (!isNaN(idx) && idx >= 0 && idx < config.radarrInstances.length) {
      inst = config.radarrInstances[idx];
      imagePath = (req.params as Record<string, string>)[0];
    } else {
      inst = config.radarrInstances[0];
      imagePath = idxStr + '/' + (req.params as Record<string, string>)[0];
    }
    if (!inst) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    const response = await radarrService.proxyImage(inst.url, inst.apiKey, imagePath);
    if (response.headers['content-type']) res.setHeader('content-type', response.headers['content-type']);
    res.setHeader('cache-control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Image not found' });
  }
});

router.get('/image/*', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const inst = config.radarrInstances[0];
    if (!inst) { res.status(400).json({ error: 'Radarr not configured' }); return; }
    const imagePath = (req.params as Record<string, string>)[0];
    const response = await radarrService.proxyImage(inst.url, inst.apiKey, imagePath);
    if (response.headers['content-type']) res.setHeader('content-type', response.headers['content-type']);
    res.setHeader('cache-control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Image not found' });
  }
});

export default router;
