import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getConfig, findSonarrInstance } from '../config.js';
import * as log from '../logger.js';
import * as sonarrService from '../services/sonarr.js';
import * as plexService from '../services/plex.js';
import { ServiceInstance } from '../types/index.js';

const router = Router();

/** Returns true if a subtitle token can be positively identified as a non-English language */
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

/** Get configured Sonarr instances, or 400 if none */
function getInstances(): ServiceInstance[] {
  const config = getConfig();
  return config.sonarrInstances.filter(i => i.url && i.apiKey);
}

/** Resolve a single instance from instanceUrl in request body, or fall back to first */
function resolveInstance(instanceUrl?: string): ServiceInstance | null {
  const config = getConfig();
  if (instanceUrl) {
    const inst = findSonarrInstance(config, instanceUrl);
    if (inst) return inst;
  }
  const instances = config.sonarrInstances.filter(i => i.url && i.apiKey);
  return instances[0] ?? null;
}


router.get('/series', async (_req: Request, res: Response) => {
  try {
    const instances = getInstances();
    if (instances.length === 0) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const allResults = await Promise.all(instances.map(async (inst, idx) => {
      const [allSeries, wantedMissing] = await Promise.all([
        sonarrService.getSeries(inst.url, inst.apiKey),
        sonarrService.getWantedMissing(inst.url, inst.apiKey),
      ]);
      const missingSeries = allSeries.filter(
        (s) => s.monitored && s.statistics && s.statistics.episodeCount > s.statistics.episodeFileCount
      );
      const latestMissingBySeriesId = new Map<number, string>();
      for (const ep of wantedMissing) {
        if (ep.airDateUtc) {
          const existing = latestMissingBySeriesId.get(ep.seriesId);
          if (!existing || ep.airDateUtc > existing) {
            latestMissingBySeriesId.set(ep.seriesId, ep.airDateUtc);
          }
        }
      }
      log.info(`Sonarr [${inst.name}]: ${missingSeries.length} missing (of ${allSeries.length} total)`);
      return missingSeries.map(s => {
        const poster = s.images.find(i => i.coverType === 'poster');
        return {
          ...s,
          latestMissingAirDate: latestMissingBySeriesId.get(s.id) ?? null,
          instanceUrl: inst.url,
          instanceName: inst.name,
          // Override poster URLs with instance index
          images: s.images.map(img => ({
            ...img,
            url: img.url ? `/api/sonarr/image/${idx}${img.url}` : img.url,
          })),
        };
      });
    }));
    res.json(allResults.flat());
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/episodes', async (req: Request, res: Response) => {
  try {
    const seriesId = parseInt(req.query.seriesId as string);
    const instanceUrl = req.query.instanceUrl as string | undefined;
    if (isNaN(seriesId)) {
      res.status(400).json({ error: 'seriesId required' });
      return;
    }
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    const episodes = await sonarrService.getEpisodes(inst.url, inst.apiKey, seriesId);
    const missing = episodes.filter(
      (ep) => !ep.hasFile && ep.monitored && ep.airDateUtc && new Date(ep.airDateUtc) < new Date()
    );
    log.verbose(`Sonarr [${inst.name}] episodes: series ${seriesId} has ${missing.length} missing`);
    res.json(missing);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/search/series', async (req: Request, res: Response) => {
  try {
    const { seriesId, instanceUrl } = req.body;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    log.verbose(`Sonarr [${inst.name}] route: search/series for seriesId=${seriesId}`);
    const result = await sonarrService.searchSeries(inst.url, inst.apiKey, seriesId);
    res.json(result);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/search/episodes', async (req: Request, res: Response) => {
  try {
    const { episodeIds, instanceUrl } = req.body;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    log.verbose(`Sonarr [${inst.name}] route: search/episodes for ${episodeIds?.length ?? 0} episode(s)`);
    const result = await sonarrService.searchEpisodes(inst.url, inst.apiKey, episodeIds);
    res.json(result);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/anime-check', async (_req: Request, res: Response) => {
  try {
    log.verbose('Sonarr route: anime-check starting');
    const instances = getInstances();
    if (instances.length === 0) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const allResults = await Promise.all(instances.map(async (inst, idx) => {
      const [allSeries, tags, rootFolders] = await Promise.all([
        sonarrService.getSeries(inst.url, inst.apiKey),
        sonarrService.getTags(inst.url, inst.apiKey),
        sonarrService.getRootFolders(inst.url, inst.apiKey),
      ]);
      const animeTagId = tags.find(t => t.label.toLowerCase() === inst.animeTag.toLowerCase())?.id;
      const animeRootPaths = rootFolders.filter(rf => rf.path.toLowerCase().includes('anime')).map(rf => rf.path);
      const isInAnimeDir = (p: string) => animeRootPaths.some(rp => p.startsWith(rp));
      const mismatches: any[] = [];
      for (const s of allSeries) {
        if (!s.monitored || !s.statistics) continue;
        const isAnimeSeries = s.seriesType === 'anime';
        const hasAnimeTag = animeTagId !== undefined && s.tags.includes(animeTagId);
        const inAnimeDir = isInAnimeDir(s.path);
        const poster = s.images.find(i => i.coverType === 'poster');
        const base = {
          id: s.id,
          title: s.title,
          year: s.year,
          service: 'sonarr' as const,
          seriesType: s.seriesType,
          genres: s.genres,
          slug: s.titleSlug,
          posterUrl: poster ? `/api/sonarr/image/${idx}${poster.url}` : undefined,
          remotePosterUrl: poster?.remoteUrl,
          hasMissing: s.statistics.episodeCount > s.statistics.episodeFileCount,
          instanceUrl: inst.url,
          instanceName: inst.name,
        };
        if (isAnimeSeries !== hasAnimeTag) {
          mismatches.push({ ...base, mismatchType: isAnimeSeries ? 'anime-not-tagged' : 'tagged-not-anime' });
        }
        if ((isAnimeSeries || hasAnimeTag) && animeRootPaths.length > 0 && !inAnimeDir) {
          mismatches.push({ ...base, mismatchType: 'wrong-directory', currentPath: s.path });
        }
      }
      log.info(`Sonarr [${inst.name}] anime-check: ${mismatches.length} mismatch(es) found`);
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
    const seriesId = parseInt(req.params.id as string, 10);
    const instanceUrl = req.body.instanceUrl as string | undefined;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    log.verbose(`Sonarr [${inst.name}] route: add-anime-tag for series ${seriesId}`);
    const tags = await sonarrService.getTags(inst.url, inst.apiKey);
    let animeTag = tags.find(t => t.label.toLowerCase() === inst.animeTag.toLowerCase());
    if (!animeTag) {
      animeTag = await sonarrService.createTag(inst.url, inst.apiKey, inst.animeTag);
    }
    await sonarrService.addTagToSeries(inst.url, inst.apiKey, seriesId, animeTag.id);
    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/subtitle-check', async (_req: Request, res: Response) => {
  try {
    log.verbose('Sonarr route: subtitle-check starting');
    const instances = getInstances();
    const config = getConfig();
    if (instances.length === 0) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    let allMissing: any[] = [];
    for (const [idx, inst] of instances.entries()) {
      const [allSeries, tags] = await Promise.all([
        sonarrService.getSeries(inst.url, inst.apiKey),
        sonarrService.getTags(inst.url, inst.apiKey),
      ]);
      const animeTagId = tags.find(t => t.label.toLowerCase() === inst.animeTag.toLowerCase())?.id;
      const animeSeries = allSeries.filter(s => {
        const isAnimeSeries = s.seriesType === 'anime';
        const hasAnimeTag = animeTagId !== undefined && s.tags.includes(animeTagId);
        return (isAnimeSeries || hasAnimeTag) && s.statistics && s.statistics.episodeFileCount > 0;
      });

      const results = await Promise.allSettled(
        animeSeries.map(s => Promise.all([
          sonarrService.getEpisodeFiles(inst.url, inst.apiKey, s.id),
          sonarrService.getEpisodes(inst.url, inst.apiKey, s.id),
        ]))
      );

      let missing: any[] = [];
      animeSeries.forEach((s, i) => {
        const result = results[i];
        if (result.status !== 'fulfilled') return;
        const [files, episodes] = result.value;
        const fileToEpisode = new Map(
          episodes.filter(e => e.episodeFileId).map(e => [e.episodeFileId!, e])
        );
        const fileToAllEpisodes = new Map<number, typeof episodes>();
        for (const e of episodes) {
          if (!e.episodeFileId) continue;
          const existing = fileToAllEpisodes.get(e.episodeFileId);
          if (existing) existing.push(e);
          else fileToAllEpisodes.set(e.episodeFileId, [e]);
        }
        const missingEngSubs = files.filter(f => {
          const subs = f.mediaInfo?.subtitles?.trim();
          return !subs ? true : !hasEnglishSubs(subs);
        });
        if (missingEngSubs.length === 0) return;
        const affectedEpisodes = missingEngSubs.map(f => {
          const ep = fileToEpisode.get(f.id);
          const allEps = fileToAllEpisodes.get(f.id) ?? (ep ? [ep] : []);
          const allEpisodeKeys = allEps
            .filter(e => e.seasonNumber != null && e.episodeNumber != null)
            .map(e => `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`);
          return {
            fileId: f.id,
            episodeId: ep?.id ?? null,
            seasonNumber: f.seasonNumber,
            episodeNumber: ep?.episodeNumber ?? null,
            title: ep?.title ?? null,
            subtitles: f.mediaInfo?.subtitles?.trim() || 'No subtitles',
            allEpisodeKeys: allEpisodeKeys.length > 1 ? allEpisodeKeys : undefined,
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
          filePaths: missingEngSubs.map(f => f.path).filter(Boolean),
          slug: s.titleSlug,
          posterUrl: poster ? `/api/sonarr/image/${idx}${poster.url}` : undefined,
          remotePosterUrl: poster?.remoteUrl,
          instanceUrl: inst.url,
          instanceName: inst.name,
        });
      });

      // Plex cross-reference
      if (config.plexToken && missing.length > 0) {
        const plexResults = await Promise.allSettled(
          missing.map(async (item) => {
            try {
              let plexMatches = await plexService.search(config.plexToken, item.title, 'show');
              let match: { ratingKey: string; title: string; year: number } | undefined;
              if (plexMatches.length === 0 && item.filePaths?.length > 0) {
                const pathMatch = await plexService.findShowByFilePath(config.plexToken, item.filePaths);
                if (pathMatch) match = pathMatch;
              } else if (plexMatches.length > 0) {
                match = plexMatches.find((r: any) => r.year === item.year) ?? plexMatches[0];
              }
              if (!match) return item;
              const plexEpisodes = await plexService.getShowEpisodes(config.plexToken, match.ratingKey);
              const plexEpMap = new Map<string, string>();
              for (const ep of plexEpisodes) {
                const key = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
                plexEpMap.set(key, ep.ratingKey);
              }
              const targets = (item.affectedEpisodes as any[])
                .filter(e => e.episodeNumber != null)
                .map(e => {
                  const primaryKey = `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`;
                  const keysToTry: string[] = e.allEpisodeKeys ?? [primaryKey];
                  const plexKey = keysToTry.find((k: string) => plexEpMap.has(k));
                  return { ep: e, key: primaryKey, plexKey: plexKey ?? primaryKey, ratingKey: plexKey ? plexEpMap.get(plexKey) : undefined };
                })
                .filter(x => x.ratingKey);
              if (targets.length === 0) return item;
              const streamResults = await Promise.allSettled(
                targets.map(x => plexService.getItemStreams(config.plexToken, x.ratingKey!, `"${item.title}" ${x.plexKey}`))
              );
              const plexHasEngSub = new Set<string>();
              targets.forEach((x, i) => {
                const r = streamResults[i];
                if (r.status === 'fulfilled' && r.value.some((s: any) => {
                  const code = s.languageCode?.toLowerCase()?.trim();
                  const lang = s.language?.toLowerCase()?.trim();
                  if (!code && !lang) return true;
                  return code === 'en' || code === 'eng' || lang === 'english';
                })) {
                  plexHasEngSub.add(x.key);
                }
              });
              if (plexHasEngSub.size === 0) return item;
              const filteredEps = (item.affectedEpisodes as any[]).filter(e => {
                if (e.episodeNumber == null) return true;
                const key = `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`;
                return !plexHasEngSub.has(key);
              });
              return { ...item, affectedEpisodes: filteredEps, affectedFiles: filteredEps.length };
            } catch {
              return item;
            }
          })
        );
        missing = plexResults
          .map(r => r.status === 'fulfilled' ? r.value : null)
          .filter((item): item is any => item != null && item.affectedFiles > 0);
      }

      log.info(`Sonarr [${inst.name}] subtitle-check: ${missing.length} series with missing English subs`);
      allMissing.push(...missing);
    }
    res.json(allMissing);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/episode-history/:episodeId', async (req: Request, res: Response) => {
  try {
    const instanceUrl = req.query.instanceUrl as string | undefined;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    const episodeId = Number(req.params.episodeId);
    if (!episodeId) { res.status(400).json({ error: 'episodeId is required' }); return; }
    const records = await sonarrService.getEpisodeHistory(inst.url, inst.apiKey, episodeId);
    const mapped = records.map(r => ({
      id: r.id,
      eventType: r.eventType,
      date: r.date,
      sourceTitle: r.sourceTitle,
      quality: r.quality?.quality?.name,
    }));
    res.json(mapped);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/mark-failed', async (req: Request, res: Response) => {
  try {
    const { seriesId, episodeFileId, episodeId, instanceUrl } = req.body;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    if (!seriesId || !episodeFileId) {
      res.status(400).json({ error: 'seriesId and episodeFileId are required' });
      return;
    }
    if (episodeId) {
      try {
        const history = await sonarrService.getSeriesHistory(inst.url, inst.apiKey, seriesId);
        const grabRecord = history.filter(h => h.episodeId === episodeId && h.eventType === 'grabbed').sort((a, b) => b.id - a.id)[0];
        if (grabRecord) {
          await sonarrService.markHistoryFailed(inst.url, inst.apiKey, grabRecord.id);
          log.info(`Marked history ${grabRecord.id} as failed for episode ${episodeId}`);
        }
      } catch (err) {
        log.warn(`Could not blocklist episode ${episodeId}: ${err instanceof Error ? err.message : err}`);
      }
    }
    await sonarrService.deleteEpisodeFile(inst.url, inst.apiKey, episodeFileId);
    if (episodeId) await sonarrService.searchEpisodes(inst.url, inst.apiKey, [episodeId]);
    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.post('/mark-episode-failed', async (req: Request, res: Response) => {
  try {
    const { seriesId, seasonNumber, episodeNumber, instanceUrl } = req.body;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    if (!seriesId) { res.status(400).json({ error: 'seriesId is required' }); return; }
    const episodes = await sonarrService.getEpisodes(inst.url, inst.apiKey, seriesId);
    let targets = episodes.filter(ep => ep.hasFile && ep.episodeFileId);
    if (seasonNumber != null) targets = targets.filter(ep => ep.seasonNumber === seasonNumber);
    if (episodeNumber != null) targets = targets.filter(ep => ep.episodeNumber === episodeNumber);
    if (targets.length === 0) { res.status(404).json({ error: 'No matching episode files found' }); return; }
    const history = await sonarrService.getSeriesHistory(inst.url, inst.apiKey, seriesId);
    let blocklisted = 0, deleted = 0;
    for (const ep of targets) {
      const grabRecord = history.filter(h => h.episodeId === ep.id && h.eventType === 'grabbed').sort((a, b) => b.id - a.id)[0];
      if (grabRecord) {
        try { await sonarrService.markHistoryFailed(inst.url, inst.apiKey, grabRecord.id); blocklisted++; } catch {}
      }
      try { await sonarrService.deleteEpisodeFile(inst.url, inst.apiKey, ep.episodeFileId!); deleted++; } catch {}
    }
    const episodeIds = targets.map(ep => ep.id);
    await sonarrService.searchEpisodes(inst.url, inst.apiKey, episodeIds);
    res.json({ success: true, blocklisted, deleted, searched: episodeIds.length });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/missing-timeline', async (_req: Request, res: Response) => {
  try {
    const instances = getInstances();
    if (instances.length === 0) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    const allResults = await Promise.all(instances.map(async (inst) => {
      const episodes = await sonarrService.getWantedMissingDetailed(inst.url, inst.apiKey);
      log.info(`Sonarr [${inst.name}] missing-timeline: ${episodes.length} missing episodes`);
      return episodes;
    }));
    res.json(allResults.flat());
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/early', async (_req: Request, res: Response) => {
  try {
    const instances = getInstances();
    if (instances.length === 0) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    const now = new Date();
    const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const allResults = await Promise.all(instances.map(async (inst, idx) => {
      const allSeries = await sonarrService.getSeries(inst.url, inst.apiKey);
      const candidates = allSeries.filter(s =>
        s.statistics?.episodeFileCount > 0 && s.nextAiring && new Date(s.nextAiring) > threshold
      );
      if (candidates.length === 0) return [];
      const episodeResults = await Promise.allSettled(
        candidates.map(s => sonarrService.getEpisodes(inst.url, inst.apiKey, s.id))
      );
      const early: object[] = [];
      candidates.forEach((s, i) => {
        const result = episodeResults[i];
        if (result.status !== 'fulfilled') return;
        const earlyEps = result.value.filter(ep => ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) > threshold);
        if (earlyEps.length === 0) return;
        const poster = s.images.find(img => img.coverType === 'poster');
        early.push({
          seriesId: s.id,
          title: s.title,
          year: s.year,
          slug: s.titleSlug,
          service: 'sonarr',
          posterUrl: poster ? `/api/sonarr/image/${idx}${poster.url}` : undefined,
          remotePosterUrl: poster?.remoteUrl,
          instanceUrl: inst.url,
          instanceName: inst.name,
          episodes: earlyEps.map(ep => ({
            episodeId: ep.id, fileId: ep.episodeFileId, seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber, title: ep.title, airDateUtc: ep.airDateUtc,
          })),
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

router.delete('/episode-file/:fileId', async (req: Request, res: Response) => {
  try {
    const instanceUrl = req.query.instanceUrl as string | undefined;
    const inst = resolveInstance(instanceUrl);
    if (!inst) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    const fileId = Number.parseInt(req.params['fileId'] as string);
    if (Number.isNaN(fileId)) { res.status(400).json({ error: 'Invalid fileId' }); return; }
    await sonarrService.deleteEpisodeFile(inst.url, inst.apiKey, fileId);
    log.info(`Sonarr [${inst.name}]: deleted episode file ${fileId}`);
    res.json({ success: true });
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// Image proxy: /image/:idx/rest/of/path
router.get('/image/:idx/*', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const idxStr = req.params.idx as string;
    const idx = parseInt(idxStr, 10);
    let inst: ServiceInstance | undefined;
    let imagePath: string;

    if (!isNaN(idx) && idx >= 0 && idx < config.sonarrInstances.length) {
      inst = config.sonarrInstances[idx];
      imagePath = (req.params as Record<string, string>)[0];
    } else {
      // Legacy: no index, treat idx as part of path and use first instance
      inst = config.sonarrInstances[0];
      imagePath = idxStr + '/' + (req.params as Record<string, string>)[0];
    }

    if (!inst) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    const response = await sonarrService.proxyImage(inst.url, inst.apiKey, imagePath);
    if (response.headers['content-type']) res.setHeader('content-type', response.headers['content-type']);
    res.setHeader('cache-control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Image not found' });
  }
});

// Legacy image proxy (no index)
router.get('/image/*', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const inst = config.sonarrInstances[0];
    if (!inst) { res.status(400).json({ error: 'Sonarr not configured' }); return; }
    const imagePath = (req.params as Record<string, string>)[0];
    const response = await sonarrService.proxyImage(inst.url, inst.apiKey, imagePath);
    if (response.headers['content-type']) res.setHeader('content-type', response.headers['content-type']);
    res.setHeader('cache-control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Image not found' });
  }
});

export default router;
