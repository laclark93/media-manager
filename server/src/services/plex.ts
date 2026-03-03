import axios from 'axios';

const PLEX_HEADERS = {
  'Accept': 'application/json',
  'X-Plex-Client-Identifier': 'missing-media-dashboard',
  'X-Plex-Product': 'Missing Media Dashboard',
};

function client(baseUrl: string, token: string) {
  return axios.create({
    baseURL: baseUrl,
    headers: { ...PLEX_HEADERS, 'X-Plex-Token': token },
  });
}

interface ServerInfo {
  machineIdentifier: string;
  uri: string; // best connection URI
}

let cachedServer: { token: string; info: ServerInfo } | null = null;

/** Discover the user's owned Plex server via plex.tv resources API */
export async function discoverServer(token: string): Promise<ServerInfo> {
  if (cachedServer && cachedServer.token === token) {
    return cachedServer.info;
  }

  const resp = await axios.get('https://plex.tv/api/v2/resources', {
    params: { includeHttps: 1, includeRelay: 1 },
    headers: { ...PLEX_HEADERS, 'X-Plex-Token': token },
  });

  // Find the first owned server that provides "server"
  const servers = resp.data.filter(
    (r: any) => r.provides?.includes('server') && r.owned,
  );
  if (servers.length === 0) {
    throw new Error('No owned Plex server found');
  }

  const server = servers[0];
  // Prefer non-relay HTTPS connection, fall back to first available
  const connections: any[] = server.connections || [];
  const best =
    connections.find((c: any) => !c.relay && c.protocol === 'https') ||
    connections.find((c: any) => !c.relay) ||
    connections[0];

  const info: ServerInfo = {
    machineIdentifier: server.clientIdentifier,
    uri: best?.uri || '',
  };
  cachedServer = { token, info };
  return info;
}

export async function search(
  token: string,
  title: string,
  type: 'movie' | 'show',
): Promise<{ ratingKey: string; title: string; year: number }[]> {
  const server = await discoverServer(token);
  const plexType = type === 'movie' ? 1 : 2;
  const resp = await client(server.uri, token).get('/search', {
    params: { query: title, type: plexType },
  });
  const results = resp.data.MediaContainer?.Metadata || [];
  return results.map((m: any) => ({
    ratingKey: m.ratingKey,
    title: m.title,
    year: m.year,
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
    const server = await discoverServer(token);
    await client(server.uri, token).get('/identity');
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
