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
