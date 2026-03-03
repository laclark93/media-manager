import { useSettings } from '../hooks/useSettings';
import { SettingsForm } from '../components/SettingsForm/SettingsForm';

export function Settings() {
  const { settings, loading, error, refresh, save, testSonarr, testRadarr, testJellyseerr, testPlex } = useSettings();

  if (loading) {
    return <div className="page"><div className="loading">Loading settings</div></div>;
  }

  if (error && !settings) {
    return (
      <div className="page">
        <div className="error-banner">{error}</div>
        <button
          onClick={refresh}
          style={{ marginTop: 12, padding: '8px 18px', cursor: 'pointer', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.9rem' }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <SettingsForm
        initialSettings={settings}
        onSave={save}
        testSonarr={testSonarr}
        testRadarr={testRadarr}
        testJellyseerr={testJellyseerr}
        testPlex={testPlex}
      />
      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 32 }}>
        v1.4.3
      </p>
    </div>
  );
}
