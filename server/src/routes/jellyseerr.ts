import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getConfig } from '../config.js';
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
    const config = getConfig();
    if (!config.jellyseerrUrl || !config.jellyseerrApiKey) {
      res.status(400).json({ error: 'Jellyseerr not configured' });
      return;
    }

    // Fetch issues + Sonarr series + Radarr movies in parallel for enrichment
    const [issuesResp, sonarrSeries, radarrMovies] = await Promise.all([
      jellyseerrService.getIssues(config.jellyseerrUrl, config.jellyseerrApiKey),
      config.sonarrUrl && config.sonarrApiKey
        ? sonarrService.getSeries(config.sonarrUrl, config.sonarrApiKey).catch(() => [])
        : Promise.resolve([]),
      config.radarrUrl && config.radarrApiKey
        ? radarrService.getMovies(config.radarrUrl, config.radarrApiKey).catch(() => [])
        : Promise.resolve([]),
    ]);

    const issues: JellyseerrIssue[] = issuesResp.results ?? [];

    // Build lookup maps by internal service ID
    const seriesById = new Map(sonarrSeries.map((s: any) => [s.id, s]));
    const moviesById = new Map(radarrMovies.map((m: any) => [m.id, m]));

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
        const movie = moviesById.get(serviceId) as any;
        if (movie) {
          mediaTitle = movie.title;
          mediaYear = movie.year;
          mediaSlug = movie.titleSlug;
          const poster = movie.images?.find((i: any) => i.coverType === 'poster');
          if (poster) {
            posterUrl = `/api/radarr/image${poster.url}`;
            remotePosterUrl = poster.remoteUrl;
          }
        }
      } else if (media.mediaType === 'tv' && serviceId) {
        const series = seriesById.get(serviceId) as any;
        if (series) {
          mediaTitle = series.title;
          mediaYear = series.year;
          mediaSlug = series.titleSlug;
          const poster = series.images?.find((i: any) => i.coverType === 'poster');
          if (poster) {
            posterUrl = `/api/sonarr/image${poster.url}`;
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
    if (mediaType === 'movie' && config.radarrUrl && config.radarrApiKey) {
      console.log(`[INFO] Jellyseerr issue #${issueId}: triggering Radarr search for movie ${externalServiceId}`);
      const result = await radarrService.searchMovie(config.radarrUrl, config.radarrApiKey, [externalServiceId]);
      res.json(result);
    } else if (mediaType === 'tv' && config.sonarrUrl && config.sonarrApiKey) {
      if (problemSeason && problemEpisode) {
        // Find the specific episode
        const episodes = await sonarrService.getEpisodes(config.sonarrUrl, config.sonarrApiKey, externalServiceId);
        const episode = (episodes as any[]).find(
          (e) => e.seasonNumber === problemSeason && e.episodeNumber === problemEpisode
        );
        if (episode) {
          console.log(`[INFO] Jellyseerr issue #${issueId}: triggering Sonarr search for S${String(problemSeason).padStart(2,'0')}E${String(problemEpisode).padStart(2,'0')} (series ${externalServiceId})`);
          const result = await sonarrService.searchEpisodes(config.sonarrUrl, config.sonarrApiKey, [episode.id]);
          res.json(result);
          return;
        }
      }
      // Fallback: search full series
      console.log(`[INFO] Jellyseerr issue #${issueId}: triggering Sonarr series search for series ${externalServiceId}`);
      const result = await sonarrService.searchSeries(config.sonarrUrl, config.sonarrApiKey, externalServiceId);
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
    console.log(`[INFO] Jellyseerr: resolving issue #${issueId}`);
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
    console.log(`[INFO] Jellyseerr: reopening issue #${issueId}`);
    const result = await jellyseerrService.reopenIssue(config.jellyseerrUrl, config.jellyseerrApiKey, issueId);
    res.json(result);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status || 502 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

export default router;
