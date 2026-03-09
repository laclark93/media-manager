import { useState, useEffect, useRef } from 'react';
import { SettingsData, SettingsSavePayload } from '../../hooks/useSettings';
import { DEFAULT_THRESHOLDS } from '../../types/common';
import { useAuth } from '../../hooks/useAuth';
import { fetchApi } from '../../utils/api';
import './SettingsForm.css';

type SettingsTab = 'sonarr' | 'radarr' | 'jellyseerr' | 'plex' | 'staleness' | 'security';

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

  const [sonarrUrl, setSonarrUrl] = useState('');
  const [sonarrApiKey, setSonarrApiKey] = useState('');
  const [sonarrApiKeyLocked, setSonarrApiKeyLocked] = useState(false);
  const [sonarrAnimeTag, setSonarrAnimeTag] = useState('anime');

  const [radarrUrl, setRadarrUrl] = useState('');
  const [radarrApiKey, setRadarrApiKey] = useState('');
  const [radarrApiKeyLocked, setRadarrApiKeyLocked] = useState(false);
  const [radarrAnimeTag, setRadarrAnimeTag] = useState('anime');

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

  const [sonarrTest, setSonarrTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [radarrTest, setRadarrTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [jellyseerrTest, setJellyseerrTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Security tab state
  const [secNewUsername, setSecNewUsername] = useState('');
  const [secCurrentPassword, setSecCurrentPassword] = useState('');
  const [secNewPassword, setSecNewPassword] = useState('');
  const [secConfirmPassword, setSecConfirmPassword] = useState('');
  const [secSaving, setSecSaving] = useState(false);
  const [secError, setSecError] = useState('');
  const [secSaved, setSecSaved] = useState(false);

  useEffect(() => {
    if (!initialSettings) return;
    setSonarrUrl(initialSettings.sonarrUrl || '');
    setSonarrApiKeyLocked(initialSettings.sonarrApiKeySet);
    setSonarrApiKey('');
    setSonarrAnimeTag(initialSettings.sonarrAnimeTag || 'anime');
    setRadarrUrl(initialSettings.radarrUrl || '');
    setRadarrApiKeyLocked(initialSettings.radarrApiKeySet);
    setRadarrApiKey('');
    setRadarrAnimeTag(initialSettings.radarrAnimeTag || 'anime');
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

  // Pre-fill new username with current when switching to Security tab
  useEffect(() => {
    if (activeTab === 'security' && username) {
      setSecNewUsername(username);
    }
  }, [activeTab, username]);

  if (!initialSettings) {
    return <div className="loading">Loading settings</div>;
  }

  const handleTestSonarr = async () => {
    setSonarrTest('testing');
    const ok = await testSonarr(sonarrUrl, sonarrApiKey);
    setSonarrTest(ok ? 'ok' : 'fail');
  };

  const handleTestRadarr = async () => {
    setRadarrTest('testing');
    const ok = await testRadarr(radarrUrl, radarrApiKey);
    setRadarrTest(ok ? 'ok' : 'fail');
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
      sonarrUrl,
      sonarrAnimeTag,
      radarrUrl,
      radarrAnimeTag,
      jellyseerrUrl,
      stalenessThresholds: { staleDays, veryStaledays, ancientDays },
    };
    if (sonarrApiKey) payload.sonarrApiKey = sonarrApiKey;
    if (radarrApiKey) payload.radarrApiKey = radarrApiKey;
    if (jellyseerrApiKey) payload.jellyseerrApiKey = jellyseerrApiKey;
    if (plexToken) payload.plexToken = plexToken;
    await onSave(payload);
    setSaving(false);
    setSaved(true);
    if (sonarrApiKey) { setSonarrApiKey(''); setSonarrApiKeyLocked(true); }
    if (radarrApiKey) { setRadarrApiKey(''); setRadarrApiKeyLocked(true); }
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
      setSecCurrentPassword('');
      setSecNewPassword('');
      setSecConfirmPassword('');
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

      {activeTab === 'sonarr' && (
        <div className="settings-form__section">
          <div className="settings-form__field">
            <label>URL</label>
            <input
              type="text"
              value={sonarrUrl}
              onChange={(e) => setSonarrUrl(e.target.value)}
              placeholder="http://192.168.1.100:8989"
            />
          </div>
          <div className="settings-form__field">
            <label>API Key</label>
            <input
              type="password"
              value={sonarrApiKeyLocked ? '••••••••••••••••' : sonarrApiKey}
              readOnly={sonarrApiKeyLocked}
              className={sonarrApiKeyLocked ? 'settings-form__input--locked' : ''}
              placeholder="Your Sonarr API key"
              onFocus={() => { if (sonarrApiKeyLocked) { setSonarrApiKeyLocked(false); setSonarrApiKey(''); } }}
              onBlur={() => { if (!sonarrApiKey && initialSettings.sonarrApiKeySet) setSonarrApiKeyLocked(true); }}
              onChange={(e) => setSonarrApiKey(e.target.value)}
            />
          </div>
          <div className="settings-form__field">
            <label>Anime Tag</label>
            <input
              type="text"
              value={sonarrAnimeTag}
              onChange={(e) => setSonarrAnimeTag(e.target.value)}
              placeholder="anime"
            />
            <span className="settings-form__hint" style={{ marginTop: 4 }}>Tag label used to identify anime series</span>
          </div>
          <button className="settings-form__test-btn" onClick={handleTestSonarr} disabled={sonarrTest === 'testing'}>
            {sonarrTest === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          {sonarrTest === 'ok' && <span className="settings-form__test-result settings-form__test-result--ok">Connected</span>}
          {sonarrTest === 'fail' && <span className="settings-form__test-result settings-form__test-result--fail">Failed</span>}
        </div>
      )}

      {activeTab === 'radarr' && (
        <div className="settings-form__section">
          <div className="settings-form__field">
            <label>URL</label>
            <input
              type="text"
              value={radarrUrl}
              onChange={(e) => setRadarrUrl(e.target.value)}
              placeholder="http://192.168.1.100:7878"
            />
          </div>
          <div className="settings-form__field">
            <label>API Key</label>
            <input
              type="password"
              value={radarrApiKeyLocked ? '••••••••••••••••' : radarrApiKey}
              readOnly={radarrApiKeyLocked}
              className={radarrApiKeyLocked ? 'settings-form__input--locked' : ''}
              placeholder="Your Radarr API key"
              onFocus={() => { if (radarrApiKeyLocked) { setRadarrApiKeyLocked(false); setRadarrApiKey(''); } }}
              onBlur={() => { if (!radarrApiKey && initialSettings.radarrApiKeySet) setRadarrApiKeyLocked(true); }}
              onChange={(e) => setRadarrApiKey(e.target.value)}
            />
          </div>
          <div className="settings-form__field">
            <label>Anime Tag</label>
            <input
              type="text"
              value={radarrAnimeTag}
              onChange={(e) => setRadarrAnimeTag(e.target.value)}
              placeholder="anime"
            />
            <span className="settings-form__hint" style={{ marginTop: 4 }}>Tag label used to identify anime movies</span>
          </div>
          <button className="settings-form__test-btn" onClick={handleTestRadarr} disabled={radarrTest === 'testing'}>
            {radarrTest === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          {radarrTest === 'ok' && <span className="settings-form__test-result settings-form__test-result--ok">Connected</span>}
          {radarrTest === 'fail' && <span className="settings-form__test-result settings-form__test-result--fail">Failed</span>}
        </div>
      )}

      {activeTab === 'jellyseerr' && (
        <div className="settings-form__section">
          <p className="settings-form__hint">Optional — enables the Issues tab.</p>
          <div className="settings-form__field">
            <label>URL</label>
            <input
              type="text"
              value={jellyseerrUrl}
              onChange={(e) => setJellyseerrUrl(e.target.value)}
              placeholder="http://192.168.1.100:5055"
            />
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
            <button
              className="settings-form__test-btn"
              onClick={handlePlexOAuth}
              disabled={plexAuthState === 'waiting'}
            >
              {plexAuthState === 'waiting' ? 'Waiting for Plex...' : 'Sign in with Plex'}
            </button>
            {plexAuthState === 'waiting' && (
              <button className="settings-form__test-btn" onClick={() => { stopPlexPolling(); setPlexAuthState('idle'); }}>
                Cancel
              </button>
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
              <input
                type="number"
                min={1}
                value={staleDays}
                onChange={(e) => setStaleDays(parseInt(e.target.value) || 7)}
              />
            </div>
            <div className="settings-form__field">
              <label>Very Stale after (days)</label>
              <input
                type="number"
                min={1}
                value={veryStaledays}
                onChange={(e) => setVeryStaledays(parseInt(e.target.value) || 28)}
              />
            </div>
            <div className="settings-form__field">
              <label>Ancient after (days)</label>
              <input
                type="number"
                min={1}
                value={ancientDays}
                onChange={(e) => setAncientDays(parseInt(e.target.value) || 90)}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="settings-form__section">
          <p className="settings-form__hint">Change your login credentials. Current user: <strong>{username}</strong></p>
          <div className="settings-form__field">
            <label>Username</label>
            <input
              type="text"
              value={secNewUsername}
              onChange={(e) => setSecNewUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="settings-form__field">
            <label>Current Password</label>
            <input
              type="password"
              value={secCurrentPassword}
              onChange={(e) => setSecCurrentPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Required to save changes"
            />
          </div>
          <div className="settings-form__field">
            <label>New Password</label>
            <input
              type="password"
              value={secNewPassword}
              onChange={(e) => setSecNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 6 characters"
            />
          </div>
          <div className="settings-form__field">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={secConfirmPassword}
              onChange={(e) => setSecConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {secError && <p className="settings-form__sec-error">{secError}</p>}
          <div className="settings-form__footer">
            <button className="settings-form__save" onClick={handleChangePassword} disabled={secSaving}>
              {secSaving ? 'Saving...' : 'Update Credentials'}
            </button>
            {secSaved && <span className="settings-form__saved">Updated!</span>}
            <button className="settings-form__logout-btn" onClick={logout}>
              Sign Out
            </button>
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
