import axios from 'axios';
import * as log from '../logger.js';

function client(baseUrl: string, apiKey: string) {
  return axios.create({
    baseURL: baseUrl,
    headers: { 'X-Api-Key': apiKey },
  });
}

export async function getIssues(baseUrl: string, apiKey: string, take = 100, skip = 0) {
  log.verbose(`Jellyseerr: fetching issues (take=${take}, skip=${skip})`);
  const resp = await client(baseUrl, apiKey).get('/api/v1/issue', {
    params: { take, skip, sort: 'added', filter: 'open' },
  });
  log.verbose(`Jellyseerr: fetched ${resp.data.results?.length ?? 0} issues`);
  return resp.data;
}

export async function resolveIssue(baseUrl: string, apiKey: string, issueId: number) {
  log.verbose(`Jellyseerr: resolving issue #${issueId}`);
  const resp = await client(baseUrl, apiKey).post(`/api/v1/issue/${issueId}/resolved`);
  log.info(`Jellyseerr: resolved issue #${issueId}`);
  return resp.data;
}

export async function reopenIssue(baseUrl: string, apiKey: string, issueId: number) {
  log.verbose(`Jellyseerr: reopening issue #${issueId}`);
  const resp = await client(baseUrl, apiKey).post(`/api/v1/issue/${issueId}/open`);
  log.info(`Jellyseerr: reopened issue #${issueId}`);
  return resp.data;
}

export async function testConnection(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    log.verbose(`Jellyseerr: testing connection to ${baseUrl}`);
    await client(baseUrl, apiKey).get('/api/v1/settings/main');
    log.verbose('Jellyseerr: connection test succeeded');
    return true;
  } catch (err) {
    log.verbose(`Jellyseerr: connection test failed — ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function getRequesters(baseUrl: string, apiKey: string): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  let skip = 0;
  const take = 1000;
  try {
    while (true) {
      log.verbose(`Jellyseerr: fetching requesters (skip=${skip})`);
      const resp = await client(baseUrl, apiKey).get('/api/v1/request', {
        params: { take, skip, sort: 'added' },
      });
      const results: any[] = resp.data.results ?? [];
      const total: number = resp.data.pageInfo?.results ?? 0;
      for (const req of results) {
        const media = req.media;
        const name: string | null = req.requestedBy?.displayName || req.requestedBy?.username || null;
        if (media.mediaType === 'tv' && media.tvdbId) {
          const key = `tv:${media.tvdbId}`;
          if (!map.has(key)) map.set(key, name);
        } else if (media.mediaType === 'movie' && media.tmdbId) {
          const key = `movie:${media.tmdbId}`;
          if (!map.has(key)) map.set(key, name);
        }
      }
      skip += take;
      if (skip >= total || results.length === 0) break;
    }
    log.verbose(`Jellyseerr: loaded ${map.size} requesters`);
  } catch (err) {
    log.verbose(`Jellyseerr: failed to fetch requesters — ${err instanceof Error ? err.message : err}`);
  }
  return map;
}
