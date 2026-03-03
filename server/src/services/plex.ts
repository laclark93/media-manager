import axios from 'axios';

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
    return cachedServer.info;
  }

  const resp = await axios.get('https://plex.tv/api/v2/resources', {
    params: { includeHttps: 1, includeRelay: 1 },
    headers: { ...PLEX_HEADERS, 'X-Plex-Token': token },
  });

  const servers = resp.data.filter(
    (r: any) => r.provides?.includes('server') && r.owned,
  );
  if (servers.length === 0) throw new Error('No owned Plex server found');

  const server = servers[0];
  const connections: any[] = server.connections || [];

  // Rank: non-relay HTTPS → relay HTTPS → non-relay HTTP
  const ranked = [
    ...connections.filter((c: any) => !c.relay && c.protocol === 'https'),
    ...connections.filter((c: any) => c.relay && c.protocol === 'https'),
    ...connections.filter((c: any) => !c.relay && c.protocol !== 'https'),
  ];

  // Try each connection until one responds
  for (const conn of ranked) {
    try {
      await axios.get(`${conn.uri}/identity`, {
        headers: { ...PLEX_HEADERS, 'X-Plex-Token': token },
        timeout: 5000,
      });
      console.log(`[INFO] Plex: connected via ${conn.uri}`);
      const info: ServerInfo = { machineIdentifier: server.clientIdentifier, uri: conn.uri };
      cachedServer = { token, info };
      return info;
    } catch {
      console.log(`[INFO] Plex: connection failed for ${conn.uri}, trying next...`);
    }
  }

  throw new Error('No reachable Plex server connection found');
}

/** Clear cached server (e.g. when token changes) */
export function clearCache() {
  cachedServer = null;
}

export async function search(
  token: string,
  title: string,
  type: 'movie' | 'show',
): Promise<{ ratingKey: string; title: string; year: number }[]> {
  const server = await discoverServer(token);
  const plexType = type === 'movie' ? 1 : 2;

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
        return results.map((m: any) => ({
          ratingKey: m.ratingKey,
          title: m.title,
          year: m.year,
        }));
      }
    } catch {
      continue;
    }
  }

  return [];
}

/** Get all episodes for a show by its ratingKey */
export async function getShowEpisodes(
  token: string,
  showRatingKey: string,
): Promise<{ ratingKey: string; seasonNumber: number; episodeNumber: number; title: string }[]> {
  const server = await discoverServer(token);
  const resp = await client(server.uri, token).get(`/library/metadata/${showRatingKey}/allLeaves`);
  const episodes = resp.data.MediaContainer?.Metadata || [];
  return episodes.map((ep: any) => ({
    ratingKey: ep.ratingKey,
    seasonNumber: ep.parentIndex ?? 0,
    episodeNumber: ep.index ?? 0,
    title: ep.title || '',
  }));
}

/** Build a Plex web URL using app.plex.tv (works from anywhere) */
export function buildWebUrl(machineIdentifier: string, ratingKey: string): string {
  const encodedKey = encodeURIComponent(`/library/metadata/${ratingKey}`);
  return `https://app.plex.tv/desktop/#!/server/${machineIdentifier}/details?key=${encodedKey}`;
}

/** Test connection by discovering the server */
export async function testConnection(token: string): Promise<boolean> {
  try {
    clearCache();
    await discoverServer(token);
    return true;
  } catch {
    return false;
  }
}

/** Create a Plex PIN for OAuth popup flow */
export async function createPin(): Promise<{ id: number; code: string }> {
  const resp = await axios.post(
    'https://plex.tv/api/v2/pins',
    new URLSearchParams({ strong: 'true' }),
    { headers: PLEX_HEADERS },
  );
  return { id: resp.data.id, code: resp.data.code };
}

/** Check if a PIN has been claimed (user authenticated), returns token or null */
export async function checkPin(pinId: number): Promise<string | null> {
  const resp = await axios.get(`https://plex.tv/api/v2/pins/${pinId}`, {
    headers: PLEX_HEADERS,
  });
  return resp.data.authToken || null;
}
