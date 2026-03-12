import axios from 'axios';
import { SonarrSeries, SonarrEpisode, SonarrEpisodeFile, SonarrHistoryRecord, ArrTag } from '../types/index.js';
import * as log from '../logger.js';

function client(baseUrl: string, apiKey: string) {
  return axios.create({
    baseURL: baseUrl,
    headers: { 'X-Api-Key': apiKey },
  });
}

export async function getSeries(baseUrl: string, apiKey: string): Promise<SonarrSeries[]> {
  log.verbose('Sonarr: fetching all series');
  const resp = await client(baseUrl, apiKey).get('/api/v3/series');
  log.verbose(`Sonarr: fetched ${resp.data.length} series`);
  return resp.data;
}

export async function getEpisodes(baseUrl: string, apiKey: string, seriesId: number): Promise<SonarrEpisode[]> {
  log.verbose(`Sonarr: fetching episodes for series ${seriesId}`);
  const resp = await client(baseUrl, apiKey).get('/api/v3/episode', {
    params: { seriesId },
  });
  log.verbose(`Sonarr: fetched ${resp.data.length} episodes for series ${seriesId}`);
  return resp.data;
}

export async function getEpisodeFiles(baseUrl: string, apiKey: string, seriesId: number): Promise<SonarrEpisodeFile[]> {
  log.verbose(`Sonarr: fetching episode files for series ${seriesId}`);
  const resp = await client(baseUrl, apiKey).get('/api/v3/episodefile', {
    params: { seriesId },
  });
  log.verbose(`Sonarr: fetched ${resp.data.length} episode files for series ${seriesId}`);
  return resp.data;
}

export async function searchSeries(baseUrl: string, apiKey: string, seriesId: number) {
  log.verbose(`Sonarr: triggering SeriesSearch for series ${seriesId}`);
  const resp = await client(baseUrl, apiKey).post('/api/v3/command', {
    name: 'SeriesSearch',
    seriesId,
  });
  log.info(`Sonarr: SeriesSearch queued for series ${seriesId} (command ${resp.data.id})`);
  return resp.data;
}

export async function searchEpisodes(baseUrl: string, apiKey: string, episodeIds: number[]) {
  log.verbose(`Sonarr: triggering EpisodeSearch for ${episodeIds.length} episode(s): [${episodeIds.join(', ')}]`);
  const resp = await client(baseUrl, apiKey).post('/api/v3/command', {
    name: 'EpisodeSearch',
    episodeIds,
  });
  log.info(`Sonarr: EpisodeSearch queued for ${episodeIds.length} episode(s) (command ${resp.data.id})`);
  return resp.data;
}

export async function testConnection(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    log.verbose(`Sonarr: testing connection to ${baseUrl}`);
    await client(baseUrl, apiKey).get('/api/v3/system/status');
    log.verbose('Sonarr: connection test succeeded');
    return true;
  } catch (err) {
    log.verbose(`Sonarr: connection test failed — ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function getTags(baseUrl: string, apiKey: string): Promise<ArrTag[]> {
  log.verbose('Sonarr: fetching tags');
  const resp = await client(baseUrl, apiKey).get('/api/v3/tag');
  log.verbose(`Sonarr: fetched ${resp.data.length} tags`);
  return resp.data;
}

export async function getRootFolders(baseUrl: string, apiKey: string): Promise<{ id: number; path: string }[]> {
  log.verbose('Sonarr: fetching root folders');
  const resp = await client(baseUrl, apiKey).get('/api/v3/rootfolder');
  log.verbose(`Sonarr: fetched ${resp.data.length} root folders`);
  return resp.data;
}

export async function getSeriesHistory(baseUrl: string, apiKey: string, seriesId: number): Promise<SonarrHistoryRecord[]> {
  log.verbose(`Sonarr: fetching history for series ${seriesId}`);
  const resp = await client(baseUrl, apiKey).get('/api/v3/history/series', {
    params: { seriesId, includeEpisode: false },
  });
  const records = resp.data ?? [];
  log.verbose(`Sonarr: fetched ${records.length} history records for series ${seriesId}`);
  return records;
}

export async function getEpisodeHistory(baseUrl: string, apiKey: string, episodeId: number): Promise<SonarrHistoryRecord[]> {
  log.verbose(`Sonarr: fetching history for episode ${episodeId}`);
  const resp = await client(baseUrl, apiKey).get('/api/v3/history', {
    params: { episodeId, pageSize: 50, sortKey: 'date', sortDirection: 'descending' },
  });
  const records = resp.data?.records ?? [];
  log.verbose(`Sonarr: fetched ${records.length} history records for episode ${episodeId}`);
  return records;
}

export async function markHistoryFailed(baseUrl: string, apiKey: string, historyId: number): Promise<void> {
  log.verbose(`Sonarr: marking history ${historyId} as failed`);
  await client(baseUrl, apiKey).post(`/api/v3/history/failed/${historyId}`);
  log.info(`Sonarr: marked history ${historyId} as failed`);
}

export async function deleteEpisodeFile(baseUrl: string, apiKey: string, fileId: number): Promise<void> {
  log.verbose(`Sonarr: deleting episode file ${fileId}`);
  await client(baseUrl, apiKey).delete(`/api/v3/episodefile/${fileId}`);
  log.info(`Sonarr: deleted episode file ${fileId}`);
}

export async function getWantedMissing(baseUrl: string, apiKey: string): Promise<{ seriesId: number; airDateUtc: string }[]> {
  log.verbose('Sonarr: fetching wanted/missing');
  const resp = await client(baseUrl, apiKey).get('/api/v3/wanted/missing', {
    params: { pageSize: 10000, sortKey: 'airDateUtc', sortDirection: 'descending' },
  });
  const records = (resp.data.records || []).map((r: any) => ({ seriesId: r.seriesId, airDateUtc: r.airDateUtc }));
  log.verbose(`Sonarr: fetched ${records.length} wanted/missing records`);
  return records;
}

export async function getWantedMissingDetailed(baseUrl: string, apiKey: string): Promise<{
  seriesId: number;
  seriesTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDateUtc: string;
}[]> {
  log.verbose('Sonarr: fetching wanted/missing (detailed)');
  const resp = await client(baseUrl, apiKey).get('/api/v3/wanted/missing', {
    params: { pageSize: 10000, sortKey: 'airDateUtc', sortDirection: 'descending', includeSeries: true },
  });
  const records = (resp.data.records || []).map((r: any) => ({
    seriesId: r.seriesId,
    seriesTitle: r.series?.title ?? '',
    seasonNumber: r.seasonNumber,
    episodeNumber: r.episodeNumber,
    title: r.title ?? '',
    airDateUtc: r.airDateUtc,
  }));
  log.verbose(`Sonarr: fetched ${records.length} wanted/missing detailed records`);
  return records;
}

export async function proxyImage(baseUrl: string, apiKey: string, imagePath: string) {
  const resp = await client(baseUrl, apiKey).get(`/${imagePath}`, {
    responseType: 'stream',
  });
  return resp;
}
