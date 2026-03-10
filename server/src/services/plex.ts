import axios from 'axios';
import * as log from '../logger.js';

const PLEX_HEADERS = {
  'Accept': 'application/json',
  'X-Plex-Client-Identifier': 'missing-media-dashboard',
  'X-Plex-Product': 'Missing Media Dashboard',
};

function client(baseUrl: string, token: string) {
  return axios.create({
    baseURL: baseUrl,
    timeout: 10000,
    headers: { ...PLEX_HEADERS, 'X-Plex-Token': token },
  });
}

interface ServerInfo {
  machineIdentifier: string;
  uri: string;
}

let cachedServer: { token: string; info: ServerInfo } | null = null;

/** Discover the user's owned Plex server, testing connectivity to each connection */
export async function discoverServer(token: string): Promise<ServerInfo> {
  if (cachedServer && cachedServer.token === token) {
    log.trace('Plex: using cached server connection');
    return cachedServer.info;
  }

  log.verbose('Plex: discovering server via plex.tv');
  const resp = await axios.get('https://plex.tv/api/v2/resources', {
    params: { includeHttps: 1, includeRelay: 1 },
    headers: { ...PLEX_HEADERS, 'X-Plex-Token': token },
  });

  const servers = resp.data.filter(
    (r: any) => r.provides?.includes('server') && r.owned,
  );
  if (servers.length === 0) throw new Error('No owned Plex server found');

  log.verbose(`Plex: found ${servers.length} owned server(s), testing connections`);
  const server = servers[0];
  const connections: any[] = server.connections || [];

  // Rank: non-relay HTTPS → relay HTTPS → non-relay HTTP
  const ranked = [
    ...connections.filter((c: any) => !c.relay && c.protocol === 'https'),
    ...connections.filter((c: any) => c.relay && c.protocol === 'https'),
    ...connections.filter((c: any) => !c.relay && c.protocol !== 'https'),
  ];

  log.verbose(`Plex: ${ranked.length} connection(s) to test`);

  // Try each connection until one responds
  for (const conn of ranked) {
    try {
      await axios.get(`${conn.uri}/identity`, {
        headers: { ...PLEX_HEADERS, 'X-Plex-Token': token },
        timeout: 5000,
      });
      log.info(`Plex: connected via ${conn.uri}${conn.relay ? ' (relay)' : ''}`);
      const info: ServerInfo = { machineIdentifier: server.clientIdentifier, uri: conn.uri };
      cachedServer = { token, info };
      return info;
    } catch {
      log.verbose(`Plex: connection failed for ${conn.uri}${conn.relay ? ' (relay)' : ''}, trying next...`);
    }
  }

  throw new Error('No reachable Plex server connection found');
}

/** Clear cached server (e.g. when token changes) */
export function clearCache() {
  log.verbose('Plex: clearing cached server');
  cachedServer = null;
}

export async function search(
  token: string,
  title: string,
  type: 'movie' | 'show',
): Promise<{ ratingKey: string; title: string; year: number }[]> {
  const server = await discoverServer(token);
  const plexType = type === 'movie' ? 1 : 2;

  log.verbose(`Plex: searching for ${type} "${title}"`);

  // Try /hubs/search first (modern), fall back to /search (legacy)
  for (const endpoint of ['/hubs/search', '/search']) {
    try {
      const resp = await client(server.uri, token).get(endpoint, {
        params: { query: title, type: plexType },
      });

      let results: any[];
      if (endpoint === '/hubs/search') {
        // /hubs/search returns hubs array — find the matching type hub
        const hubs = resp.data.MediaContainer?.Hub || [];
        const hub = hubs.find((h: any) =>
          (type === 'show' && h.type === 'show') ||
          (type === 'movie' && h.type === 'movie')
        );
        results = hub?.Metadata || [];
      } else {
        results = resp.data.MediaContainer?.Metadata || [];
      }

      if (results.length > 0) {
        log.verbose(`Plex: search "${title}" returned ${results.length} result(s) via ${endpoint}`);
        return results.map((m: any) => ({
          ratingKey: m.ratingKey,
          title: m.title,
          year: m.year,
        }));
      }
      log.trace(`Plex: search "${title}" via ${endpoint} returned 0 results`);
    } catch (err) {
      log.trace(`Plex: search "${title}" via ${endpoint} failed — ${err instanceof Error ? err.message : err}`);
      continue;
    }
  }

  log.verbose(`Plex: search "${title}" found no results`);
  return [];
}

/** Find a Plex show by matching Sonarr file paths against Plex library locations */
export async function findShowByFilePath(
  token: string,
  filePaths: string[],
): Promise<{ ratingKey: string; title: string; year: number } | null> {
  const server = await discoverServer(token);

  // Get all library sections
  const sectionsResp = await client(server.uri, token).get('/library/sections');
  const sections = sectionsResp.data.MediaContainer?.Directory || [];
  const tvSections = sections.filter((s: any) => s.type === 'show');

  if (tvSections.length === 0) {
    log.verbose('Plex findShowByFilePath: no TV sections found');
    return null;
  }

  // Strip trailing year suffix like " (2002)" from folder names for fuzzy matching
  const stripYear = (name: string) => name.replace(/\s*\(\d{4}\)\s*$/, '').trim();

  // Extract series folder from file paths (e.g. /tv/Full Moon wo Sagashite (2002)/Season 01/ep.mkv)
  // Use the parent-of-parent directory (file → season folder → series folder)
  const seriesFolders: string[] = [];
  for (const fp of filePaths) {
    const normalized = fp.replace(/\\/g, '/');
    const parts = normalized.split('/');
    if (parts.length >= 3) {
      const seriesFolder = parts[parts.length - 3].toLowerCase();
      if (!seriesFolders.includes(seriesFolder)) seriesFolders.push(seriesFolder);
    }
  }

  if (seriesFolders.length === 0) {
    log.trace(`Plex findShowByFilePath: no series folders extracted from ${filePaths.length} paths (first: ${filePaths[0] ?? 'none'})`);
    return null;
  }

  // Build set of names to match: exact folder + year-stripped version
  const namesToMatch = new Set<string>();
  for (const f of seriesFolders) {
    namesToMatch.add(f);
    const stripped = stripYear(f);
    if (stripped !== f) namesToMatch.add(stripped);
  }
  log.trace(`Plex findShowByFilePath: looking for folders [${[...namesToMatch].join(', ')}]`);

  // Browse each TV section and match by Location
  for (const section of tvSections) {
    const allResp = await client(server.uri, token).get(`/library/sections/${section.key}/all`, {
      params: { type: 2, includeGuids: 0 },
    });
    const shows = allResp.data.MediaContainer?.Metadata || [];
    log.trace(`Plex findShowByFilePath: section "${section.title}" has ${shows.length} shows`);

    for (const show of shows) {
      // Try Location paths first
      const locations: string[] = (show.Location || []).map((l: any) => l.path?.replace(/\\/g, '/') || '');
      for (const loc of locations) {
        const locFolder = (loc.split('/').pop() || '').toLowerCase();
        if (!locFolder) continue;
        const locStripped = stripYear(locFolder);

        for (const name of namesToMatch) {
          if (locFolder === name || locStripped === name || locFolder.startsWith(name) || name.startsWith(locFolder) || locStripped.startsWith(name) || name.startsWith(locStripped)) {
            log.trace(`Plex findShowByFilePath: matched "${show.title}" via folder "${locFolder}" ↔ "${name}"`);
            return { ratingKey: show.ratingKey, title: show.title, year: show.year ?? 0 };
          }
        }
      }

      // Fallback: match against Plex show title (handles cases where Location isn't returned)
      const plexTitle = (show.title || '').toLowerCase();
      const plexTitleStripped = stripYear(plexTitle);
      for (const name of namesToMatch) {
        if (plexTitle === name || plexTitleStripped === name || plexTitle.startsWith(name) || name.startsWith(plexTitle) || plexTitleStripped.startsWith(name) || name.startsWith(plexTitleStripped)) {
          log.trace(`Plex findShowByFilePath: matched "${show.title}" via title "${plexTitle}" ↔ "${name}"`);
          return { ratingKey: show.ratingKey, title: show.title, year: show.year ?? 0 };
        }
      }
    }
  }

  log.trace('Plex findShowByFilePath: no match found');
  return null;
}

/** Find a Plex movie by matching Radarr file paths against Plex library locations */
export async function findMovieByFilePath(
  token: string,
  filePaths: string[],
): Promise<{ ratingKey: string; title: string; year: number } | null> {
  const server = await discoverServer(token);
  const stripYear = (name: string) => name.replace(/\s*\(\d{4}\)\s*$/, '').trim();

  const sectionsResp = await client(server.uri, token).get('/library/sections');
  const sections = sectionsResp.data.MediaContainer?.Directory || [];
  const movieSections = sections.filter((s: any) => s.type === 'movie');

  if (movieSections.length === 0) {
    log.verbose('Plex findMovieByFilePath: no movie sections found');
    return null;
  }

  const folderNames: string[] = [];
  for (const fp of filePaths) {
    const normalized = fp.replace(/\\/g, '/');
    const parts = normalized.split('/');
    if (parts.length >= 2) {
      const folder = parts[parts.length - 2].toLowerCase();
      if (!folderNames.includes(folder)) folderNames.push(folder);
    }
  }

  if (folderNames.length === 0) return null;

  const namesToMatch = new Set<string>();
  for (const f of folderNames) {
    namesToMatch.add(f);
    const stripped = stripYear(f);
    if (stripped !== f) namesToMatch.add(stripped);
  }
  log.trace(`Plex findMovieByFilePath: looking for folders [${[...namesToMatch].join(', ')}]`);

  for (const section of movieSections) {
    const allResp = await client(server.uri, token).get(`/library/sections/${section.key}/all`, {
      params: { type: 1 },
    });
    const movies = allResp.data.MediaContainer?.Metadata || [];
    log.trace(`Plex findMovieByFilePath: section "${section.title}" has ${movies.length} movies`);

    for (const movie of movies) {
      const locations: string[] = (movie.Location || []).map((l: any) => l.path?.replace(/\\/g, '/') || '');
      for (const loc of locations) {
        const locFolder = (loc.split('/').pop() || '').toLowerCase();
        if (!locFolder) continue;
        const locStripped = stripYear(locFolder);

        for (const name of namesToMatch) {
          if (locFolder === name || locStripped === name || locFolder.startsWith(name) || name.startsWith(locFolder) || locStripped.startsWith(name) || name.startsWith(locStripped)) {
            log.trace(`Plex findMovieByFilePath: matched "${movie.title}" via folder "${locFolder}" ↔ "${name}"`);
            return { ratingKey: movie.ratingKey, title: movie.title, year: movie.year ?? 0 };
          }
        }
      }

      // Fallback: match against Plex movie title
      const plexTitle = (movie.title || '').toLowerCase();
      const plexTitleStripped = stripYear(plexTitle);
      for (const name of namesToMatch) {
        if (plexTitle === name || plexTitleStripped === name || plexTitle.startsWith(name) || name.startsWith(plexTitle) || plexTitleStripped.startsWith(name) || name.startsWith(plexTitleStripped)) {
          log.trace(`Plex findMovieByFilePath: matched "${movie.title}" via title "${plexTitle}" ↔ "${name}"`);
          return { ratingKey: movie.ratingKey, title: movie.title, year: movie.year ?? 0 };
        }
      }
    }
  }

  log.trace('Plex findMovieByFilePath: no match found');
  return null;
}

/** Get all episodes for a show by its ratingKey */
export async function getShowEpisodes(
  token: string,
  showRatingKey: string,
): Promise<{ ratingKey: string; seasonNumber: number; episodeNumber: number; title: string }[]> {
  const server = await discoverServer(token);
  log.verbose(`Plex: fetching episodes for show ratingKey=${showRatingKey}`);
  const resp = await client(server.uri, token).get(`/library/metadata/${showRatingKey}/allLeaves`);
  const episodes = resp.data.MediaContainer?.Metadata || [];
  log.verbose(`Plex: fetched ${episodes.length} episodes for show ratingKey=${showRatingKey}`);
  return episodes.map((ep: any) => ({
    ratingKey: ep.ratingKey,
    seasonNumber: ep.parentIndex ?? 0,
    episodeNumber: ep.index ?? 0,
    title: ep.title || '',
  }));
}

export interface SubtitleStream {
  language: string;
  languageCode: string;
  codec: string;
  forced: boolean;
  displayTitle?: string;
}

/** Get subtitle streams for a specific item (episode or movie) by its ratingKey */
export async function getItemStreams(token: string, ratingKey: string, context?: string): Promise<SubtitleStream[]> {
  const server = await discoverServer(token);
  const label = context ?? `ratingKey=${ratingKey}`;
  log.trace(`Plex: fetching streams for ${label}`);
  const resp = await client(server.uri, token).get(`/library/metadata/${ratingKey}`);
  const metadata = resp.data.MediaContainer?.Metadata?.[0];
  if (!metadata) {
    log.trace(`Plex: no metadata found for ${label}`);
    return [];
  }
  const streams: SubtitleStream[] = [];
  for (const media of metadata.Media || []) {
    for (const part of media.Part || []) {
      const allStreams = part.Stream || [];
      log.trace(`Plex getItemStreams ${label}: ${allStreams.length} total streams, types=[${allStreams.map((s: any) => s.streamType).join(',')}]`);
      for (const stream of allStreams) {
        if (stream.streamType === 3) {
          log.trace(`Plex subtitle stream ${label}: language=${stream.language ?? 'null'} languageCode=${stream.languageCode ?? 'null'} displayTitle=${stream.displayTitle ?? 'null'} codec=${stream.codec ?? 'null'}`);
          streams.push({
            language: stream.language || '',
            languageCode: stream.languageCode || '',
            codec: stream.codec || '',
            forced: !!stream.forced,
            displayTitle: stream.displayTitle,
          });
        }
      }
    }
  }
  log.verbose(`Plex: ${streams.length} subtitle stream(s) found for ${label}`);
  return streams;
}

/** Build a Plex web URL using app.plex.tv (works from anywhere) */
export function buildWebUrl(machineIdentifier: string, ratingKey: string): string {
  const encodedKey = encodeURIComponent(`/library/metadata/${ratingKey}`);
  return `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=${encodedKey}`;
}

/** Test connection by discovering the server */
export async function testConnection(token: string): Promise<boolean> {
  try {
    log.verbose('Plex: testing connection');
    clearCache();
    await discoverServer(token);
    log.verbose('Plex: connection test succeeded');
    return true;
  } catch (err) {
    log.verbose(`Plex: connection test failed — ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/** Create a Plex PIN for OAuth popup flow */
export async function createPin(): Promise<{ id: number; code: string }> {
  log.verbose('Plex: creating OAuth PIN');
  const resp = await axios.post(
    'https://plex.tv/api/v2/pins',
    new URLSearchParams({ strong: 'true' }),
    { headers: PLEX_HEADERS },
  );
  log.verbose(`Plex: created PIN id=${resp.data.id}`);
  return { id: resp.data.id, code: resp.data.code };
}

/** Check if a PIN has been claimed (user authenticated), returns token or null */
export async function checkPin(pinId: number): Promise<string | null> {
  log.trace(`Plex: checking PIN ${pinId}`);
  const resp = await axios.get(`https://plex.tv/api/v2/pins/${pinId}`, {
    headers: PLEX_HEADERS,
  });
  const token = resp.data.authToken || null;
  if (token) log.info(`Plex: PIN ${pinId} claimed successfully`);
  else log.trace(`Plex: PIN ${pinId} not yet claimed`);
  return token;
}
