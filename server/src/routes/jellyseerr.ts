import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getConfig } from '../config.js';
import * as log from '../logger.js';
import * as jellyseerrService from '../services/jellyseerr.js';
import * as sonarrService from '../services/sonarr.js';
import * as radarrService from '../services/radarr.js';
import { JellyseerrIssue } from '../types/index.js';

const router = Router();

// ISSUE_TYPE labels
const ISSUE_TYPE_LABELS: Record<number, string> = {
  1: 'Video',
  2: 'Audio',
  3: 'Subtitle',
  4: 'Other',
};

router.get('/issues', async (_req: Request, res: Response) => {
  try {
    log.verbose('Jellyseerr route: fetching issues');
    const config = getConfig();
    if (!config.jellyseerrUrl || !config.jellyseerrApiKey) {
      res.status(400).json({ error: 'Jellyseerr not configured' });
      return;
    }

    // Fetch issues + all Sonarr/Radarr instances for enrichment
    const sonarrPromises = config.sonarrInstances.map(inst =>
      sonarrService.getSeries(inst.url, inst.apiKey).catch(() => [])
    );
    const radarrPromises = config.radarrInstances.map(inst =>
      radarrService.getMovies(inst.url, inst.apiKey).catch(() => [])
    );

    const [issuesResp, ...rest] = await Promise.all([
      jellyseerrService.getIssues(config.jellyseerrUrl, config.jellyseerrApiKey),
      ...sonarrPromises,
      ...radarrPromises,
    ]);

    const sonarrResults = rest.slice(0, sonarrPromises.length);
    const radarrResults = rest.slice(sonarrPromises.length);

    // Build lookup maps by internal service ID (first match wins across instances)
    const seriesById = new Map<number, { series: any; instIdx: number }>();
    sonarrResults.forEach((seriesList: any[], instIdx: number) => {
      for (const s of seriesList) {
        if (!seriesById.has(s.id)) seriesById.set(s.id, { series: s, instIdx });
      }
    });
    const moviesById = new Map<number, { movie: any; instIdx: number }>();
    radarrResults.forEach((movieList: any[], instIdx: number) => {
      for (const m of movieList) {
        if (!moviesById.has(m.id)) moviesById.set(m.id, { movie: m, instIdx });
      }
    });

    const issues: JellyseerrIssue[] = issuesResp.results ?? [];

    const enriched = issues.map((issue: JellyseerrIssue) => {
      const media = issue.media;
      const serviceId = media.externalServiceId;
      let mediaTitle = 'Unknown Title';
      let mediaYear: number | undefined;
      let posterUrl: string | undefined;
      let remotePosterUrl: string | undefined;
      let externalServiceId: number | undefined = serviceId;
      let mediaSlug: string | undefined;

      if (media.mediaType === 'movie' && serviceId) {
        const entry = moviesById.get(serviceId);
        if (entry) {
          const movie = entry.movie;
          mediaTitle = movie.title;
          mediaYear = movie.year;
          mediaSlug = movie.titleSlug;
          const poster = movie.images?.find((i: any) => i.coverType === 'poster');
          if (poster) {
            posterUrl = `/api/radarr/image/${entry.instIdx}${poster.url}`;
            remotePosterUrl = poster.remoteUrl;
          }
        }
      } else if (media.mediaType === 'tv' && serviceId) {
        const entry = seriesById.get(serviceId);
        if (entry) {
          const series = entry.series;
          mediaTitle = series.title;
          mediaYear = series.year;
          mediaSlug = series.titleSlug;
          const poster = series.images?.find((i: any) => i.coverType === 'poster');
          if (poster) {
            posterUrl = `/api/sonarr/image/${entry.instIdx}${poster.url}`;
            remotePosterUrl = poster.remoteUrl;
          }
        }
      }

      // Fallback: use TMDB poster path via Jellyseerr image proxy
      if (!remotePosterUrl && media.posterPath) {
        remotePosterUrl = `https://image.tmdb.org/t/p/w300${media.posterPath}`;
      }

      return {
        ...issue,
        mediaTitle,
        mediaYear,
        posterUrl,
        remotePosterUrl,
        externalServiceId,
        mediaSlug,
        issueTypeLabel: ISSUE_TYPE_LABELS[issue.issueType] ?? 'Other',
      };
    });

    log.info(`Jellyseerr: returning ${enriched.length} enriched issue(s)`);
    res.json(enriched);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// Trigger a search/replace for the media linked to an issue
router.post('/issues/:id/search', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const { mediaType, externalServiceId, problemSeason, problemEpisode } = req.body as {
      mediaType: 'movie' | 'tv';
      externalServiceId: number;
      problemSeason?: number;
      problemEpisode?: number;
    };

    const issueId = req.params['id'];
    if (mediaType === 'movie' && config.radarrInstances.length > 0) {
      const inst = config.radarrInstances[0];
      log.info(` Jellyseerr issue #${issueId}: triggering Radarr search for movie ${externalServiceId}`);
      const result = await radarrService.searchMovie(inst.url, inst.apiKey, [externalServiceId]);
      res.json(result);
    } else if (mediaType === 'tv' && config.sonarrInstances.length > 0) {
      const inst = config.sonarrInstances[0];
      if (problemSeason && problemEpisode) {
        // Find the specific episode
        const episodes = await sonarrService.getEpisodes(inst.url, inst.apiKey, externalServiceId);
        const episode = (episodes as any[]).find(
          (e) => e.seasonNumber === problemSeason && e.episodeNumber === problemEpisode
        );
        if (episode) {
          log.info(` Jellyseerr issue #${issueId}: triggering Sonarr search for S${String(problemSeason).padStart(2,'0')}E${String(problemEpisode).padStart(2,'0')} (series ${externalServiceId})`);
          const result = await sonarrService.searchEpisodes(inst.url, inst.apiKey, [episode.id]);
          res.json(result);
          return;
        }
      }
      // Fallback: search full series
      log.info(` Jellyseerr issue #${issueId}: triggering Sonarr series search for series ${externalServiceId}`);
      const result = await sonarrService.searchSeries(inst.url, inst.apiKey, externalServiceId);
      res.json(result);
    } else {
      res.status(400).json({ error: 'Service not configured or unknown media type' });
    }
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// Mark an issue as resolved in Jellyseerr
router.post('/issues/:id/resolve', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const issueId = parseInt(req.params['id'] as string);
    log.info(` Jellyseerr: resolving issue #${issueId}`);
    const result = await jellyseerrService.resolveIssue(config.jellyseerrUrl, config.jellyseerrApiKey, issueId);
    res.json(result);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// Reopen a resolved issue in Jellyseerr
router.post('/issues/:id/reopen', async (req: Request, res: Response) => {
  try {
    const config = getConfig();
    const issueId = parseInt(req.params['id'] as string);
    log.info(` Jellyseerr: reopening issue #${issueId}`);
    const result = await jellyseerrService.reopenIssue(config.jellyseerrUrl, config.jellyseerrApiKey, issueId);
    res.json(result);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

export default router;
