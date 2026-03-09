import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getConfig } from '../config.js';
import * as sonarrService from '../services/sonarr.js';
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


router.get('/series', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.sonarrUrl || !config.sonarrApiKey) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const [allSeries, wantedMissing] = await Promise.all([
      sonarrService.getSeries(config.sonarrUrl, config.sonarrApiKey),
      sonarrService.getWantedMissing(config.sonarrUrl, config.sonarrApiKey),
    ]);
    const missingSeries = allSeries.filter(
      (s) => s.monitored && s.statistics && s.statistics.episodeCount > s.statistics.episodeFileCount
    );
    // Compute latest missing episode air date per series
    const latestMissingBySeriesId = new Map<number, string>();
    for (const ep of wantedMissing) {
      if (ep.airDateUtc) {
        const existing = latestMissingBySeriesId.get(ep.seriesId);
        if (!existing || ep.airDateUtc > existing) {
          latestMissingBySeriesId.set(ep.seriesId, ep.airDateUtc);
        }
      }
    }
    const enriched = missingSeries.map(s => ({
      ...s,
      latestMissingAirDate: latestMissingBySeriesId.get(s.id) ?? null,
    }));
    console.log(`[INFO] Sonarr series: ${missingSeries.length} missing (of ${allSeries.length} total)`);
    res.json(enriched);
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
      .filter(s => s.monitored && s.statistics)
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
          hasMissing: s.statistics.episodeCount > s.statistics.episodeFileCount,
        };
      })
      .filter(Boolean);
    console.log(`[INFO] Sonarr anime-check: ${mismatches.length} mismatch(es) found`);
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

    let missing: any[] = [];
    animeSeries.forEach((s, i) => {
      const result = results[i];
      if (result.status !== 'fulfilled') return;
      const [files, episodes] = result.value;

      // Map episodeFileId → episode for quick lookup (last episode wins for combined files)
      const fileToEpisode = new Map(
        episodes.filter(e => e.episodeFileId).map(e => [e.episodeFileId!, e])
      );
      // Map episodeFileId → all episodes (handles combined files like S05E03-04)
      const fileToAllEpisodes = new Map<number, typeof episodes>();
      for (const e of episodes) {
        if (!e.episodeFileId) continue;
        const existing = fileToAllEpisodes.get(e.episodeFileId);
        if (existing) existing.push(e);
        else fileToAllEpisodes.set(e.episodeFileId, [e]);
      }

      // Flag files where: (a) no subtitle tracks at all (anime should always have subs), OR
      // (b) subtitle tracks exist but none are English (unnamed tracks assumed English)
      const missingEngSubs = files.filter(f => {
        const subs = f.mediaInfo?.subtitles?.trim();
        const flagged = !subs ? true : !hasEnglishSubs(subs);
        if (flagged) {
          const ep = fileToEpisode.get(f.id);
          const epLabel = ep ? `S${String(f.seasonNumber).padStart(2,'0')}E${String(ep.episodeNumber).padStart(2,'0')}` : `S${String(f.seasonNumber).padStart(2,'0')}E??`;
          console.log(`[TRACE] subtitle-check flag: "${s.title}" ${epLabel} fileId=${f.id} subtitles=${JSON.stringify(f.mediaInfo?.subtitles ?? null)}`);
        }
        return flagged;
      });
      if (missingEngSubs.length === 0) return;

      const affectedEpisodes = missingEngSubs.map(f => {
        const ep = fileToEpisode.get(f.id);
        const allEps = fileToAllEpisodes.get(f.id) ?? (ep ? [ep] : []);
        const allEpisodeKeys = allEps
          .filter(e => e.seasonNumber != null && e.episodeNumber != null)
          .map(e => `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`);
        const subtitleLabel = f.mediaInfo?.subtitles?.trim() || 'No subtitles';
        return {
          fileId: f.id,
          episodeId: ep?.id ?? null,
          seasonNumber: f.seasonNumber,
          episodeNumber: ep?.episodeNumber ?? null,
          title: ep?.title ?? null,
          subtitles: subtitleLabel,
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
        posterUrl: poster ? `/api/sonarr/image${poster.url}` : undefined,
        remotePosterUrl: poster?.remoteUrl,
      });
    });

    // Plex cross-reference: filter out false positives caused by external subtitle files
    // (Plex indexes external .ass/.srt files as subtitle streams; Sonarr mediaInfo does not)
    if (config.plexToken && missing.length > 0) {
      const plexResults = await Promise.allSettled(
        missing.map(async (item) => {
          try {
            let plexMatches = await plexService.search(config.plexToken, item.title, 'show');
            console.log(`[TRACE] plex search "${item.title}": ${plexMatches.length} result(s)`);

            // Fallback: if title search fails, match by file path (handles title mismatches like "Full Moon wo Sagashite" vs "Full Moon")
            let match: { ratingKey: string; title: string; year: number } | undefined;
            if (plexMatches.length === 0 && item.filePaths?.length > 0) {
              console.log(`[TRACE] plex title search failed for "${item.title}", trying file-path fallback`);
              const pathMatch = await plexService.findShowByFilePath(config.plexToken, item.filePaths);
              if (pathMatch) {
                match = pathMatch;
              }
            } else if (plexMatches.length > 0) {
              match = plexMatches.find((r: any) => r.year === item.year) ?? plexMatches[0];
            }

            if (!match) return item;
            console.log(`[TRACE] plex match: "${match.title}" (${match.year}) ratingKey=${match.ratingKey}`);

            const plexEpisodes = await plexService.getShowEpisodes(config.plexToken, match.ratingKey);
            const plexEpMap = new Map<string, string>();
            for (const ep of plexEpisodes) {
              const key = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
              plexEpMap.set(key, ep.ratingKey);
            }
            console.log(`[TRACE] plex episodes found: ${plexEpisodes.length}`);

            // Fetch streams only for affected episodes that exist in Plex
            // For combined files (e.g. S05E03-04), try all episode keys to find the Plex entry
            const targets = (item.affectedEpisodes as any[])
              .filter(e => e.episodeNumber != null)
              .map(e => {
                const primaryKey = `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`;
                const keysToTry: string[] = e.allEpisodeKeys ?? [primaryKey];
                const plexKey = keysToTry.find((k: string) => plexEpMap.has(k));
                return { ep: e, key: primaryKey, plexKey: plexKey ?? primaryKey, ratingKey: plexKey ? plexEpMap.get(plexKey) : undefined };
              })
              .filter(x => x.ratingKey);

            console.log(`[TRACE] plex targets for stream check "${item.title}": ${targets.map(x => x.key + (x.plexKey !== x.key ? `(→${x.plexKey})` : '')).join(', ') || 'none'}`);
            if (targets.length === 0) return item;

            const streamResults = await Promise.allSettled(
              targets.map(x => plexService.getItemStreams(config.plexToken, x.ratingKey!, `"${item.title}" ${x.plexKey}`))
            );

            const plexHasEngSub = new Set<string>();
            targets.forEach((x, i) => {
              const r = streamResults[i];
              if (r.status === 'fulfilled') {
                const subStreams = r.value;
                const epLabel = x.plexKey !== x.key ? `${x.key}(→${x.plexKey})` : x.key;
                console.log(`[TRACE] plex streams for "${item.title}" ${epLabel}: ${subStreams.map((s: any) => `lang=${s.language ?? 'null'} code=${s.languageCode ?? 'null'} display=${s.displayTitle ?? 'null'}`).join(', ') || 'no subtitle streams'}`);
                if (r.value.some((s: any) => {
                  const code = s.languageCode?.toLowerCase()?.trim();
                  const lang = s.language?.toLowerCase()?.trim();
                  // No language info → assume English (same denylist principle)
                  if (!code && !lang) return true;
                  return code === 'en' || code === 'eng' || lang === 'english';
                })) {
                  plexHasEngSub.add(x.key);
                }
              } else {
                console.log(`[TRACE] plex stream fetch failed for ${x.key}: ${r.reason}`);
              }
            });

            if (plexHasEngSub.size === 0) {
              console.log(`[TRACE] plex found no English subs for "${item.title}" — keeping flagged`);
              return item;
            }

            const filteredEps = (item.affectedEpisodes as any[]).filter(e => {
              if (e.episodeNumber == null) return true;
              const key = `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`;
              return !plexHasEngSub.has(key);
            });

            console.log(`[TRACE] plex cleared ${plexHasEngSub.size} episode(s) in "${item.title}": ${[...plexHasEngSub].join(', ')}`);

            return { ...item, affectedEpisodes: filteredEps, affectedFiles: filteredEps.length };
          } catch (err) {
            console.log(`[TRACE] plex lookup failed for "${item.title}": ${err instanceof Error ? err.message : err}`);
            return item;
          }
        })
      );
      missing = plexResults
        .map(r => r.status === 'fulfilled' ? r.value : null)
        .filter((item): item is any => item != null && item.affectedFiles > 0);
    }

    console.log(`[INFO] Sonarr subtitle-check: ${missing.length} series with missing English subs (of ${animeSeries.length} anime series checked)`);
    res.json(missing);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.get('/episode-history/:episodeId', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.sonarrUrl || !config.sonarrApiKey) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const episodeId = Number(req.params.episodeId);
    if (!episodeId) {
      res.status(400).json({ error: 'episodeId is required' });
      return;
    }
    const records = await sonarrService.getEpisodeHistory(config.sonarrUrl, config.sonarrApiKey, episodeId);
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

router.get('/early', async (_req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.sonarrUrl || !config.sonarrApiKey) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const now = new Date();
    const threshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour grace period
    const allSeries = await sonarrService.getSeries(config.sonarrUrl, config.sonarrApiKey);

    // Only check series that have files AND have a future airing (optimisation)
    const candidates = allSeries.filter(s =>
      s.statistics?.episodeFileCount > 0 &&
      s.nextAiring &&
      new Date(s.nextAiring) > threshold
    );

    if (candidates.length === 0) {
      res.json([]);
      return;
    }

    const episodeResults = await Promise.allSettled(
      candidates.map(s => sonarrService.getEpisodes(config.sonarrUrl, config.sonarrApiKey, s.id))
    );

    const early: object[] = [];
    candidates.forEach((s, i) => {
      const result = episodeResults[i];
      if (result.status !== 'fulfilled') return;
      const earlyEps = result.value.filter(ep =>
        ep.hasFile && ep.airDateUtc && new Date(ep.airDateUtc) > threshold
      );
      if (earlyEps.length === 0) return;
      const poster = s.images.find(img => img.coverType === 'poster');
      early.push({
        seriesId: s.id,
        title: s.title,
        year: s.year,
        slug: s.titleSlug,
        service: 'sonarr',
        posterUrl: poster ? `/api/sonarr/image${poster.url}` : undefined,
        remotePosterUrl: poster?.remoteUrl,
        episodes: earlyEps.map(ep => ({
          episodeId: ep.id,
          fileId: ep.episodeFileId,
          seasonNumber: ep.seasonNumber,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          airDateUtc: ep.airDateUtc,
        })),
      });
    });

    console.log(`[INFO] Sonarr early: ${early.length} series with pre-release files`);
    res.json(early);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

router.delete('/episode-file/:fileId', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    if (!config.sonarrUrl || !config.sonarrApiKey) {
      res.status(400).json({ error: 'Sonarr not configured' });
      return;
    }
    const fileId = Number.parseInt(req.params['fileId'] as string);
    if (Number.isNaN(fileId)) {
      res.status(400).json({ error: 'Invalid fileId' });
      return;
    }
    await sonarrService.deleteEpisodeFile(config.sonarrUrl, config.sonarrApiKey, fileId);
    console.log(`[INFO] Sonarr: deleted episode file ${fileId}`);
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
