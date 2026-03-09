import axios from 'axios';
import { SonarrSeries, SonarrEpisode, SonarrEpisodeFile, SonarrHistoryRecord, ArrTag } from '../types/index.js';

function client(baseUrl: string, apiKey: string) {
  return axios.create({
    baseURL: baseUrl,
    headers: { 'X-Api-Key': apiKey },
  });
}

export async function getSeries(baseUrl: string, apiKey: string): Promise<SonarrSeries[]> {
  const resp = await client(baseUrl, apiKey).get('/api/v3/series');
  return resp.data;
}

export async function getEpisodes(baseUrl: string, apiKey: string, seriesId: number): Promise<SonarrEpisode[]> {
  const resp = await client(baseUrl, apiKey).get('/api/v3/episode', {
    params: { seriesId },
  });
  return resp.data;
}

export async function getEpisodeFiles(baseUrl: string, apiKey: string, seriesId: number): Promise<SonarrEpisodeFile[]> {
  const resp = await client(baseUrl, apiKey).get('/api/v3/episodefile', {
    params: { seriesId },
  });
  return resp.data;
}

export async function searchSeries(baseUrl: string, apiKey: string, seriesId: number) {
  const resp = await client(baseUrl, apiKey).post('/api/v3/command', {
    name: 'SeriesSearch',
    seriesId,
  });
  return resp.data;
}

export async function searchEpisodes(baseUrl: string, apiKey: string, episodeIds: number[]) {
  const resp = await client(baseUrl, apiKey).post('/api/v3/command', {
    name: 'EpisodeSearch',
    episodeIds,
  });
  return resp.data;
}

export async function testConnection(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    await client(baseUrl, apiKey).get('/api/v3/system/status');
    return true;
  } catch {
    return false;
  }
}

export async function getTags(baseUrl: string, apiKey: string): Promise<ArrTag[]> {
  const resp = await client(baseUrl, apiKey).get('/api/v3/tag');
  return resp.data;
}

export async function getSeriesHistory(baseUrl: string, apiKey: string, seriesId: number): Promise<SonarrHistoryRecord[]> {
  const resp = await client(baseUrl, apiKey).get('/api/v3/history/series', {
    params: { seriesId, includeEpisode: false },
  });
  return resp.data ?? [];
}

export async function getEpisodeHistory(baseUrl: string, apiKey: string, episodeId: number): Promise<SonarrHistoryRecord[]> {
  const resp = await client(baseUrl, apiKey).get('/api/v3/history', {
    params: { episodeId, pageSize: 50, sortKey: 'date', sortDirection: 'descending' },
  });
  return resp.data?.records ?? [];
}

export async function markHistoryFailed(baseUrl: string, apiKey: string, historyId: number): Promise<void> {
  await client(baseUrl, apiKey).post(`/api/v3/history/failed/${historyId}`);
}

export async function deleteEpisodeFile(baseUrl: string, apiKey: string, fileId: number): Promise<void> {
  await client(baseUrl, apiKey).delete(`/api/v3/episodefile/${fileId}`);
}

export async function getWantedMissing(baseUrl: string, apiKey: string): Promise<{ seriesId: number; airDateUtc: string }[]> {
  const resp = await client(baseUrl, apiKey).get('/api/v3/wanted/missing', {
    params: { pageSize: 10000, sortKey: 'airDateUtc', sortDirection: 'descending' },
  });
  return (resp.data.records || []).map((r: any) => ({ seriesId: r.seriesId, airDateUtc: r.airDateUtc }));
}

export async function proxyImage(baseUrl: string, apiKey: string, imagePath: string) {
  const resp = await client(baseUrl, apiKey).get(`/${imagePath}`, {
    responseType: 'stream',
  });
  return resp;
}
