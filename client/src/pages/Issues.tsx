import { useJellyseerr } from '../hooks/useJellyseerr';
import { useSettings } from '../hooks/useSettings';
import { useActivityLog } from '../hooks/useActivityLog';
import { IssueCard } from '../components/IssueCard/IssueCard';

export function Issues() {
  const { issues, loading, error, searchIssue, resolveIssue, reopenIssue, dismissIssue } = useJellyseerr();
  const { settings } = useSettings();
  const { addEntry, updateEntry } = useActivityLog();

  if (!settings?.jellyseerrConfigured) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>Jellyseerr Not Configured</h2>
          <p>Add your Jellyseerr URL and API key in Settings to view issues.</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="page"><div className="loading">Loading issues</div></div>;

  return (
    <div className="page">
      {error && <div className="error-banner">{error}</div>}
      {issues.length === 0 ? (
        <div className="empty-state">
          <h2>No Open Issues</h2>
          <p>There are no open issues in Jellyseerr.</p>
        </div>
      ) : (
        <div className="media-grid">
          {issues.map(issue => (
            <IssueCard
              key={issue.id}
              issue={issue}
              sonarrUrl={settings?.sonarrUrl || ''}
              radarrUrl={settings?.radarrUrl || ''}
              onSearch={async () => {
                const title = issue.mediaTitle || `Issue #${issue.id}`;
                const eid = addEntry('Search Issue', title);
                try {
                  await searchIssue(issue.id, {
                    mediaType: issue.media.mediaType,
                    externalServiceId: issue.externalServiceId!,
                    problemSeason: issue.problemSeason || undefined,
                    problemEpisode: issue.problemEpisode || undefined,
                  });
                  updateEntry(eid, 'success', 'Queued');
                } catch {
                  updateEntry(eid, 'error', 'Failed');
                }
              }}
              onResolve={async () => {
                const title = issue.mediaTitle || `Issue #${issue.id}`;
                const eid = addEntry('Resolve Issue', title);
                try { await resolveIssue(issue.id); updateEntry(eid, 'success', 'Resolved'); }
                catch { updateEntry(eid, 'error', 'Failed'); throw new Error('resolve failed'); }
              }}
              onUndo={async () => {
                const title = issue.mediaTitle || `Issue #${issue.id}`;
                const eid = addEntry('Undo Resolve', title);
                try { await reopenIssue(issue.id); updateEntry(eid, 'success', 'Reopened'); }
                catch { updateEntry(eid, 'error', 'Failed'); throw new Error('reopen failed'); }
              }}
              onDismiss={() => dismissIssue(issue.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
