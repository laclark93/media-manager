import axios from 'axios';
import { RadarrMovie, RadarrMovieFile, RadarrHistoryRecord, ArrTag } from '../types/index.js';
import * as log from '../logger.js';

function client(baseUrl: string, apiKey: string) {
  return axios.create({
    baseURL: baseUrl,
    headers: { 'X-Api-Key': apiKey },
  });
}

export async function getMovies(baseUrl: string, apiKey: string): Promise<RadarrMovie[]> {
  log.verbose('Radarr: fetching all movies');
  const resp = await client(baseUrl, apiKey).get('/api/v3/movie');
  log.verbose(`Radarr: fetched ${resp.data.length} movies`);
  return resp.data;
}

export async function getMovieFiles(baseUrl: string, apiKey: string, movieId: number): Promise<RadarrMovieFile[]> {
  log.verbose(`Radarr: fetching movie files for movie ${movieId}`);
  const resp = await client(baseUrl, apiKey).get('/api/v3/moviefile', {
    params: { movieId },
  });
  log.verbose(`Radarr: fetched ${resp.data.length} movie files for movie ${movieId}`);
  return resp.data;
}

export async function searchMovie(baseUrl: string, apiKey: string, movieIds: number[]) {
  log.verbose(`Radarr: triggering MoviesSearch for movie(s) [${movieIds.join(', ')}]`);
  const resp = await client(baseUrl, apiKey).post('/api/v3/command', {
    name: 'MoviesSearch',
    movieIds,
  });
  log.info(`Radarr: MoviesSearch queued for movie(s) [${movieIds.join(', ')}] (command ${resp.data.id})`);
  return resp.data;
}

export async function testConnection(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    log.verbose(`Radarr: testing connection to ${baseUrl}`);
    await client(baseUrl, apiKey).get('/api/v3/system/status');
    log.verbose('Radarr: connection test succeeded');
    return true;
  } catch (err) {
    log.verbose(`Radarr: connection test failed — ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function getTags(baseUrl: string, apiKey: string): Promise<ArrTag[]> {
  log.verbose('Radarr: fetching tags');
  const resp = await client(baseUrl, apiKey).get('/api/v3/tag');
  log.verbose(`Radarr: fetched ${resp.data.length} tags`);
  return resp.data;
}

export async function getMovieHistory(baseUrl: string, apiKey: string, movieId: number): Promise<RadarrHistoryRecord[]> {
  log.verbose(`Radarr: fetching history for movie ${movieId}`);
  const resp = await client(baseUrl, apiKey).get('/api/v3/history/movie', {
    params: { movieId, includeMovie: false },
  });
  const records = resp.data ?? [];
  log.verbose(`Radarr: fetched ${records.length} history records for movie ${movieId}`);
  return records;
}

export async function markHistoryFailed(baseUrl: string, apiKey: string, historyId: number): Promise<void> {
  log.verbose(`Radarr: marking history ${historyId} as failed`);
  await client(baseUrl, apiKey).post(`/api/v3/history/failed/${historyId}`);
  log.info(`Radarr: marked history ${historyId} as failed`);
}

export async function deleteMovieFile(baseUrl: string, apiKey: string, fileId: number): Promise<void> {
  log.verbose(`Radarr: deleting movie file ${fileId}`);
  await client(baseUrl, apiKey).delete(`/api/v3/moviefile/${fileId}`);
  log.info(`Radarr: deleted movie file ${fileId}`);
}

export async function proxyImage(baseUrl: string, apiKey: string, imagePath: string) {
  const resp = await client(baseUrl, apiKey).get(`/${imagePath}`, {
    responseType: 'stream',
  });
  return resp;
}
