import { useState, useEffect, useRef } from 'react';
import { SettingsData, SettingsSavePayload, InstanceData } from '../../hooks/useSettings';
import { DEFAULT_THRESHOLDS } from '../../types/common';
import { useAuth } from '../../hooks/useAuth';
import { fetchApi } from '../../utils/api';
import './SettingsForm.css';

type SettingsTab = 'sonarr' | 'radarr' | 'jellyseerr' | 'plex' | 'staleness' | 'security';

interface InstanceFormState {
  name: string;
  url: string;
  apiKey: string;
  apiKeyLocked: boolean;
  animeTag: string;
  testState: 'idle' | 'testing' | 'ok' | 'fail';
}

function defaultInstance(name: string): InstanceFormState {
  return { name, url: '', apiKey: '', apiKeyLocked: false, animeTag: 'anime', testState: 'idle' };
}

function fromServerInstance(inst: InstanceData): InstanceFormState {
  return {
    name: inst.name,
    url: inst.url,
    apiKey: '',
    apiKeyLocked: inst.apiKeySet,
    animeTag: inst.animeTag || 'anime',
    testState: 'idle',
  };
}

interface SettingsFormProps {
  initialSettings: SettingsData | null;
  onSave: (data: SettingsSavePayload) => Promise<void>;
  testSonarr: (url: string, apiKey: string) => Promise<boolean>;
  testRadarr: (url: string, apiKey: string) => Promise<boolean>;
  testJellyseerr: (url: string, apiKey: string) => Promise<boolean>;
  testPlex: (apiKey: string) => Promise<boolean>;
}

export function SettingsForm({ initialSettings, onSave, testSonarr, testRadarr, testJellyseerr, testPlex }: SettingsFormProps) {
  const { username, changePassword, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('sonarr');

  const [sonarrInstances, setSonarrInstances] = useState<InstanceFormState[]>([]);
  const [radarrInstances, setRadarrInstances] = useState<InstanceFormState[]>([]);

  const [jellyseerrUrl, setJellyseerrUrl] = useState('');
  const [jellyseerrApiKey, setJellyseerrApiKey] = useState('');
  const [jellyseerrApiKeyLocked, setJellyseerrApiKeyLocked] = useState(false);

  const [plexToken, setPlexToken] = useState('');
  const [plexTokenLocked, setPlexTokenLocked] = useState(false);
  const [plexTest, setPlexTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [plexAuthState, setPlexAuthState] = useState<'idle' | 'waiting' | 'ok' | 'fail'>('idle');
  const plexPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const plexPopupRef = useRef<Window | null>(null);

  const [staleDays, setStaleDays] = useState(DEFAULT_THRESHOLDS.staleDays);
  const [veryStaledays, setVeryStaledays] = useState(DEFAULT_THRESHOLDS.veryStaledays);
  const [ancientDays, setAncientDays] = useState(DEFAULT_THRESHOLDS.ancientDays);

  const [jellyseerrTest, setJellyseerrTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [secNewUsername, setSecNewUsername] = useState('');
  const [secCurrentPassword, setSecCurrentPassword] = useState('');
  const [secNewPassword, setSecNewPassword] = useState('');
  const [secConfirmPassword, setSecConfirmPassword] = useState('');
  const [secSaving, setSecSaving] = useState(false);
  const [secError, setSecError] = useState('');
  const [secSaved, setSecSaved] = useState(false);

  useEffect(() => {
    if (!initialSettings) return;
    // Build instances from server data
    const sonarr = initialSettings.sonarrInstances?.length
      ? initialSettings.sonarrInstances.map(fromServerInstance)
      : initialSettings.sonarrUrl
        ? [{ name: 'Sonarr', url: initialSettings.sonarrUrl, apiKey: '', apiKeyLocked: initialSettings.sonarrApiKeySet, animeTag: initialSettings.sonarrAnimeTag || 'anime', testState: 'idle' as const }]
        : [];
    setSonarrInstances(sonarr);

    const radarr = initialSettings.radarrInstances?.length
      ? initialSettings.radarrInstances.map(fromServerInstance)
      : initialSettings.radarrUrl
        ? [{ name: 'Radarr', url: initialSettings.radarrUrl, apiKey: '', apiKeyLocked: initialSettings.radarrApiKeySet, animeTag: initialSettings.radarrAnimeTag || 'anime', testState: 'idle' as const }]
        : [];
    setRadarrInstances(radarr);

    setJellyseerrUrl(initialSettings.jellyseerrUrl || '');
    setJellyseerrApiKeyLocked(initialSettings.jellyseerrApiKeySet);
    setJellyseerrApiKey('');
    setPlexTokenLocked(initialSettings.plexTokenSet);
    setPlexToken('');
    if (initialSettings.stalenessThresholds) {
      setStaleDays(initialSettings.stalenessThresholds.staleDays);
      setVeryStaledays(initialSettings.stalenessThresholds.veryStaledays);
      setAncientDays(initialSettings.stalenessThresholds.ancientDays);
    }
  }, [initialSettings]);

  useEffect(() => {
    if (activeTab === 'security' && username) setSecNewUsername(username);
  }, [activeTab, username]);

  if (!initialSettings) return <div className="loading">Loading settings</div>;

  const updateSonarrInstance = (idx: number, changes: Partial<InstanceFormState>) => {
    setSonarrInstances(prev => prev.map((inst, i) => i === idx ? { ...inst, ...changes } : inst));
  };
  const updateRadarrInstance = (idx: number, changes: Partial<InstanceFormState>) => {
    setRadarrInstances(prev => prev.map((inst, i) => i === idx ? { ...inst, ...changes } : inst));
  };

  const handleTestInstance = async (type: 'sonarr' | 'radarr', idx: number) => {
    const instances = type === 'sonarr' ? sonarrInstances : radarrInstances;
    const update = type === 'sonarr' ? updateSonarrInstance : updateRadarrInstance;
    const testFn = type === 'sonarr' ? testSonarr : testRadarr;
    const inst = instances[idx];
    update(idx, { testState: 'testing' });
    const ok = await testFn(inst.url, inst.apiKey);
    update(idx, { testState: ok ? 'ok' : 'fail' });
  };

  const handleTestJellyseerr = async () => {
    setJellyseerrTest('testing');
    const ok = await testJellyseerr(jellyseerrUrl, jellyseerrApiKey);
    setJellyseerrTest(ok ? 'ok' : 'fail');
  };

  const handleTestPlex = async () => {
    setPlexTest('testing');
    const ok = await testPlex(plexToken);
    setPlexTest(ok ? 'ok' : 'fail');
  };

  const stopPlexPolling = () => {
    if (plexPollRef.current) { clearInterval(plexPollRef.current); plexPollRef.current = null; }
    if (plexPopupRef.current && !plexPopupRef.current.closed) { plexPopupRef.current.close(); }
    plexPopupRef.current = null;
  };

  const handlePlexOAuth = async () => {
    setPlexAuthState('waiting');
    try {
      const pin = await fetchApi<{ id: number; code: string }>('/api/plex/auth/pin', { method: 'POST' });
      const authUrl = `https://app.plex.tv/auth#?clientID=missing-media-dashboard&code=${pin.code}&context%5Bdevice%5D%5Bproduct%5D=Missing%20Media%20Dashboard`;
      plexPopupRef.current = window.open(authUrl, 'plexAuth', 'width=800,height=700');
      plexPollRef.current = setInterval(async () => {
        try {
          const result = await fetchApi<{ token: string | null }>(`/api/plex/auth/pin/${pin.id}`);
          if (result.token) {
            stopPlexPolling();
            setPlexToken(result.token);
            setPlexTokenLocked(false);
            setPlexAuthState('ok');
          } else if (plexPopupRef.current?.closed) {
            stopPlexPolling();
            setPlexAuthState('idle');
          }
        } catch {
          stopPlexPolling();
          setPlexAuthState('fail');
        }
      }, 2000);
    } catch {
      setPlexAuthState('fail');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const payload: SettingsSavePayload = {
      sonarrInstances: sonarrInstances.map(inst => ({
        name: inst.name,
        url: inst.url,
        apiKey: inst.apiKey || undefined,
        animeTag: inst.animeTag,
      })),
      radarrInstances: radarrInstances.map(inst => ({
        name: inst.name,
        url: inst.url,
        apiKey: inst.apiKey || undefined,
        animeTag: inst.animeTag,
      })),
      jellyseerrUrl,
      stalenessThresholds: { staleDays, veryStaledays, ancientDays },
    };
    if (jellyseerrApiKey) payload.jellyseerrApiKey = jellyseerrApiKey;
    if (plexToken) payload.plexToken = plexToken;
    await onSave(payload);
    setSaving(false);
    setSaved(true);
    // Re-lock API keys after save
    setSonarrInstances(prev => prev.map(inst => inst.apiKey ? { ...inst, apiKey: '', apiKeyLocked: true } : inst));
    setRadarrInstances(prev => prev.map(inst => inst.apiKey ? { ...inst, apiKey: '', apiKeyLocked: true } : inst));
    if (jellyseerrApiKey) { setJellyseerrApiKey(''); setJellyseerrApiKeyLocked(true); }
    if (plexToken) { setPlexToken(''); setPlexTokenLocked(true); }
    setTimeout(() => setSaved(false), 3000);
  };

  const handleChangePassword = async () => {
    setSecError('');
    if (!secCurrentPassword) { setSecError('Current password is required'); return; }
    if (!secNewPassword) { setSecError('New password is required'); return; }
    if (secNewPassword !== secConfirmPassword) { setSecError('Passwords do not match'); return; }
    setSecSaving(true);
    try {
      await changePassword(secCurrentPassword, secNewUsername, secNewPassword);
      setSecCurrentPassword(''); setSecNewPassword(''); setSecConfirmPassword('');
      setSecSaved(true);
      setTimeout(() => setSecSaved(false), 3000);
    } catch (err) {
      setSecError(err instanceof Error ? err.message : 'Failed to update credentials');
    } finally {
      setSecSaving(false);
    }
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'sonarr', label: 'Sonarr' },
    { id: 'radarr', label: 'Radarr' },
    { id: 'jellyseerr', label: 'Jellyseerr' },
    { id: 'plex', label: 'Plex' },
    { id: 'staleness', label: 'Staleness' },
    { id: 'security', label: 'Security' },
  ];

  const renderInstanceList = (
    type: 'sonarr' | 'radarr',
    instances: InstanceFormState[],
    setInstances: React.Dispatch<React.SetStateAction<InstanceFormState[]>>,
    update: (idx: number, changes: Partial<InstanceFormState>) => void,
  ) => (
    <div className="settings-form__section">
      {instances.map((inst, idx) => (
        <div key={idx} className="settings-form__instance">
          {instances.length > 1 && (
            <div className="settings-form__instance-header">
              <span className="settings-form__instance-label">{inst.name || `Instance ${idx + 1}`}</span>
              <button
                className="settings-form__instance-remove"
                onClick={() => setInstances(prev => prev.filter((_, i) => i !== idx))}
                title="Remove instance"
              >
                Remove
              </button>
            </div>
          )}
          <div className="settings-form__field">
            <label>Name</label>
            <input
              type="text"
              value={inst.name}
              onChange={(e) => update(idx, { name: e.target.value })}
              placeholder={type === 'sonarr' ? 'Sonarr' : 'Radarr'}
            />
          </div>
          <div className="settings-form__field">
            <label>URL</label>
            <input
              type="text"
              value={inst.url}
              onChange={(e) => update(idx, { url: e.target.value })}
              placeholder={type === 'sonarr' ? 'http://192.168.1.100:8989' : 'http://192.168.1.100:7878'}
            />
          </div>
          <div className="settings-form__field">
            <label>API Key</label>
            <input
              type="password"
              value={inst.apiKeyLocked ? '••••••••••••••••' : inst.apiKey}
              readOnly={inst.apiKeyLocked}
              className={inst.apiKeyLocked ? 'settings-form__input--locked' : ''}
              placeholder={`Your ${type === 'sonarr' ? 'Sonarr' : 'Radarr'} API key`}
              onFocus={() => { if (inst.apiKeyLocked) update(idx, { apiKeyLocked: false, apiKey: '' }); }}
              onBlur={() => {
                const instances = initialSettings?.[`${type}Instances` as 'sonarrInstances' | 'radarrInstances'];
                if (!inst.apiKey && instances?.[idx]?.apiKeySet) {
                  update(idx, { apiKeyLocked: true });
                }
              }}
              onChange={(e) => update(idx, { apiKey: e.target.value })}
            />
          </div>
          <div className="settings-form__field">
            <label>Anime Tag</label>
            <input
              type="text"
              value={inst.animeTag}
              onChange={(e) => update(idx, { animeTag: e.target.value })}
              placeholder="anime"
            />
            <span className="settings-form__hint" style={{ marginTop: 4 }}>Tag label used to identify anime</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: instances.length > 1 ? 20 : 0 }}>
            <button className="settings-form__test-btn" onClick={() => handleTestInstance(type, idx)} disabled={inst.testState === 'testing'}>
              {inst.testState === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {inst.testState === 'ok' && <span className="settings-form__test-result settings-form__test-result--ok">Connected</span>}
            {inst.testState === 'fail' && <span className="settings-form__test-result settings-form__test-result--fail">Failed</span>}
          </div>
          {idx < instances.length - 1 && instances.length > 1 && <hr className="settings-form__divider" />}
        </div>
      ))}
      <button
        className="settings-form__add-btn"
        onClick={() => setInstances(prev => [...prev, defaultInstance(`${type === 'sonarr' ? 'Sonarr' : 'Radarr'} ${prev.length + 1}`)])}
      >
        + Add {type === 'sonarr' ? 'Sonarr' : 'Radarr'} Instance
      </button>
    </div>
  );

  return (
    <div className="settings-form">
      <h2>Settings</h2>

      <div className="settings-form__tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`settings-form__tab${activeTab === tab.id ? ' settings-form__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'sonarr' && renderInstanceList('sonarr', sonarrInstances, setSonarrInstances, updateSonarrInstance)}

      {activeTab === 'radarr' && renderInstanceList('radarr', radarrInstances, setRadarrInstances, updateRadarrInstance)}

      {activeTab === 'jellyseerr' && (
        <div className="settings-form__section">
          <p className="settings-form__hint">Optional — enables the Issues tab.</p>
          <div className="settings-form__field">
            <label>URL</label>
            <input type="text" value={jellyseerrUrl} onChange={(e) => setJellyseerrUrl(e.target.value)} placeholder="http://192.168.1.100:5055" />
          </div>
          <div className="settings-form__field">
            <label>API Key</label>
            <input
              type="password"
              value={jellyseerrApiKeyLocked ? '••••••••••••••••' : jellyseerrApiKey}
              readOnly={jellyseerrApiKeyLocked}
              className={jellyseerrApiKeyLocked ? 'settings-form__input--locked' : ''}
              placeholder="Your Jellyseerr API key"
              onFocus={() => { if (jellyseerrApiKeyLocked) { setJellyseerrApiKeyLocked(false); setJellyseerrApiKey(''); } }}
              onBlur={() => { if (!jellyseerrApiKey && initialSettings.jellyseerrApiKeySet) setJellyseerrApiKeyLocked(true); }}
              onChange={(e) => setJellyseerrApiKey(e.target.value)}
            />
          </div>
          <button className="settings-form__test-btn" onClick={handleTestJellyseerr} disabled={jellyseerrTest === 'testing'}>
            {jellyseerrTest === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          {jellyseerrTest === 'ok' && <span className="settings-form__test-result settings-form__test-result--ok">Connected</span>}
          {jellyseerrTest === 'fail' && <span className="settings-form__test-result settings-form__test-result--fail">Failed</span>}
        </div>
      )}

      {activeTab === 'plex' && (
        <div className="settings-form__section">
          <p className="settings-form__hint">Optional — enables &quot;Open in Plex&quot; links on subtitle cards.</p>
          <div className="settings-form__field">
            <label>Token</label>
            <input
              type="password"
              value={plexTokenLocked ? '••••••••••••••••' : plexToken}
              readOnly={plexTokenLocked}
              className={plexTokenLocked ? 'settings-form__input--locked' : ''}
              placeholder="Your Plex token"
              onFocus={() => { if (plexTokenLocked) { setPlexTokenLocked(false); setPlexToken(''); } }}
              onBlur={() => { if (!plexToken && initialSettings.plexTokenSet) setPlexTokenLocked(true); }}
              onChange={(e) => setPlexToken(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="settings-form__test-btn" onClick={handlePlexOAuth} disabled={plexAuthState === 'waiting'}>
              {plexAuthState === 'waiting' ? 'Waiting for Plex...' : 'Sign in with Plex'}
            </button>
            {plexAuthState === 'waiting' && (
              <button className="settings-form__test-btn" onClick={() => { stopPlexPolling(); setPlexAuthState('idle'); }}>Cancel</button>
            )}
            {plexAuthState === 'ok' && <span className="settings-form__test-result settings-form__test-result--ok">Token retrieved!</span>}
            {plexAuthState === 'fail' && <span className="settings-form__test-result settings-form__test-result--fail">Failed</span>}
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="settings-form__test-btn" onClick={handleTestPlex} disabled={plexTest === 'testing'}>
              {plexTest === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {plexTest === 'ok' && <span className="settings-form__test-result settings-form__test-result--ok">Connected</span>}
            {plexTest === 'fail' && <span className="settings-form__test-result settings-form__test-result--fail">Failed</span>}
          </div>
        </div>
      )}

      {activeTab === 'staleness' && (
        <div className="settings-form__section">
          <p className="settings-form__hint">Days after which a title&apos;s staleness level increases.</p>
          <div className="settings-form__row">
            <div className="settings-form__field">
              <label>Stale after (days)</label>
              <input type="number" min={1} value={staleDays} onChange={(e) => setStaleDays(parseInt(e.target.value) || 7)} />
            </div>
            <div className="settings-form__field">
              <label>Very Stale after (days)</label>
              <input type="number" min={1} value={veryStaledays} onChange={(e) => setVeryStaledays(parseInt(e.target.value) || 28)} />
            </div>
            <div className="settings-form__field">
              <label>Ancient after (days)</label>
              <input type="number" min={1} value={ancientDays} onChange={(e) => setAncientDays(parseInt(e.target.value) || 90)} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="settings-form__section">
          <p className="settings-form__hint">Change your login credentials. Current user: <strong>{username}</strong></p>
          <div className="settings-form__field">
            <label>Username</label>
            <input type="text" value={secNewUsername} onChange={(e) => setSecNewUsername(e.target.value)} autoComplete="username" />
          </div>
          <div className="settings-form__field">
            <label>Current Password</label>
            <input type="password" value={secCurrentPassword} onChange={(e) => setSecCurrentPassword(e.target.value)} autoComplete="current-password" placeholder="Required to save changes" />
          </div>
          <div className="settings-form__field">
            <label>New Password</label>
            <input type="password" value={secNewPassword} onChange={(e) => setSecNewPassword(e.target.value)} autoComplete="new-password" placeholder="At least 6 characters" />
          </div>
          <div className="settings-form__field">
            <label>Confirm New Password</label>
            <input type="password" value={secConfirmPassword} onChange={(e) => setSecConfirmPassword(e.target.value)} autoComplete="new-password" />
          </div>
          {secError && <p className="settings-form__sec-error">{secError}</p>}
          <div className="settings-form__footer">
            <button className="settings-form__save" onClick={handleChangePassword} disabled={secSaving}>
              {secSaving ? 'Saving...' : 'Update Credentials'}
            </button>
            {secSaved && <span className="settings-form__saved">Updated!</span>}
            <button className="settings-form__logout-btn" onClick={logout}>Sign Out</button>
          </div>
        </div>
      )}

      {activeTab !== 'security' && (
        <div className="settings-form__footer">
          <button className="settings-form__save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && <span className="settings-form__saved">Saved!</span>}
        </div>
      )}
    </div>
  );
}
