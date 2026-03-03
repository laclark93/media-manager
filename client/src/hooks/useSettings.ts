import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../utils/api';
import { StalenessThresholds, DEFAULT_THRESHOLDS } from '../types/common';

export interface SettingsData {
  sonarrUrl: string;
  sonarrApiKeySet: boolean;
  radarrUrl: string;
  radarrApiKeySet: boolean;
  jellyseerrUrl: string;
  jellyseerrApiKeySet: boolean;
  stalenessThresholds: StalenessThresholds;
  sonarrConfigured: boolean;
  radarrConfigured: boolean;
  jellyseerrConfigured: boolean;
}

export interface SettingsSavePayload {
  sonarrUrl?: string;
  sonarrApiKey?: string;
  radarrUrl?: string;
  radarrApiKey?: string;
  jellyseerrUrl?: string;
  jellyseerrApiKey?: string;
  stalenessThresholds?: StalenessThresholds;
}

export function useSettings() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<SettingsData>('/api/settings');
      if (!data.stalenessThresholds) {
        data.stalenessThresholds = DEFAULT_THRESHOLDS;
      }
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async (data: SettingsSavePayload) => {
    await fetchApi('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    await refresh();
  }, [refresh]);

  const testSonarr = useCallback(async (url: string, apiKey: string): Promise<boolean> => {
    const result = await fetchApi<{ success: boolean }>('/api/settings/test/sonarr', {
      method: 'POST',
      body: JSON.stringify({ url, apiKey }),
    });
    return result.success;
  }, []);

  const testRadarr = useCallback(async (url: string, apiKey: string): Promise<boolean> => {
    const result = await fetchApi<{ success: boolean }>('/api/settings/test/radarr', {
      method: 'POST',
      body: JSON.stringify({ url, apiKey }),
    });
    return result.success;
  }, []);

  const testJellyseerr = useCallback(async (url: string, apiKey: string): Promise<boolean> => {
    const result = await fetchApi<{ success: boolean }>('/api/settings/test/jellyseerr', {
      method: 'POST',
      body: JSON.stringify({ url, apiKey }),
    });
    return result.success;
  }, []);

  return { settings, loading, error, refresh, save, testSonarr, testRadarr, testJellyseerr };
}
