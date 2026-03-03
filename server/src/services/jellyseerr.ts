import axios from 'axios';

function client(baseUrl: string, apiKey: string) {
  return axios.create({
    baseURL: baseUrl,
    headers: { 'X-Api-Key': apiKey },
  });
}

export async function getIssues(baseUrl: string, apiKey: string, take = 100, skip = 0) {
  const resp = await client(baseUrl, apiKey).get('/api/v1/issue', {
    params: { take, skip, sort: 'added', filter: 'open' },
  });
  return resp.data;
}

export async function resolveIssue(baseUrl: string, apiKey: string, issueId: number) {
  const resp = await client(baseUrl, apiKey).post(`/api/v1/issue/${issueId}/resolved`);
  return resp.data;
}

export async function reopenIssue(baseUrl: string, apiKey: string, issueId: number) {
  const resp = await client(baseUrl, apiKey).post(`/api/v1/issue/${issueId}/open`);
  return resp.data;
}

export async function testConnection(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    await client(baseUrl, apiKey).get('/api/v1/settings/main');
    return true;
  } catch {
    return false;
  }
}
