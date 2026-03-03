import axios from 'axios';
import { RadarrMovie, RadarrMovieFile, RadarrHistoryRecord, ArrTag } from '../types/index.js';

function client(baseUrl: string, apiKey: string) {
  return axios.create({
    baseURL: baseUrl,
    headers: { 'X-Api-Key': apiKey },
  });
}

export async function getMovies(baseUrl: string, apiKey: string): Promise<RadarrMovie[]> {
  const resp = await client(baseUrl, apiKey).get('/api/v3/movie');
  return resp.data;
}

export async function getMovieFiles(baseUrl: string, apiKey: string, movieId: number): Promise<RadarrMovieFile[]> {
  const resp = await client(baseUrl, apiKey).get('/api/v3/moviefile', {
    params: { movieId },
  });
  return resp.data;
}

export async function searchMovie(baseUrl: string, apiKey: string, movieIds: number[]) {
  const resp = await client(baseUrl, apiKey).post('/api/v3/command', {
    name: 'MoviesSearch',
    movieIds,
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

export async function getMovieHistory(baseUrl: string, apiKey: string, movieId: number): Promise<RadarrHistoryRecord[]> {
  const resp = await client(baseUrl, apiKey).get('/api/v3/history', {
    params: { movieId, pageSize: 100 },
  });
  return resp.data.records ?? [];
}

export async function markHistoryFailed(baseUrl: string, apiKey: string, historyId: number): Promise<void> {
  await client(baseUrl, apiKey).post(`/api/v3/history/failed/${historyId}`);
}

export async function deleteMovieFile(baseUrl: string, apiKey: string, fileId: number): Promise<void> {
  await client(baseUrl, apiKey).delete(`/api/v3/moviefile/${fileId}`);
}

export async function proxyImage(baseUrl: string, apiKey: string, imagePath: string) {
  const resp = await client(baseUrl, apiKey).get(`/${imagePath}`, {
    responseType: 'stream',
  });
  return resp;
}
