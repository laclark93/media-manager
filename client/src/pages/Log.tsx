import { useActivityLog } from '../hooks/useActivityLog';
import './Log.css';

export function Log() {
  const { entries, clearEntries } = useActivityLog();

  return (
    <div className="page log-page">
      <div className="log-page__header">
        <h2 className="log-page__title">Activity Log</h2>
        {entries.length > 0 && (
          <button className="log-page__clear" onClick={clearEntries}>
            Clear
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="empty-state">
          <h2>No Activity</h2>
          <p>Actions like searches and resolves will appear here.</p>
        </div>
      ) : (
        <div className="log-page__list">
          {entries.map(entry => (
            <div key={entry.id} className="log-page__entry">
              <span className={`log-page__status log-page__status--${entry.status}`} />
              <span className="log-page__time">{entry.timestamp.toLocaleTimeString()}</span>
              <span className="log-page__action">{entry.action}</span>
              <span className="log-page__target" title={entry.target}>{entry.target}</span>
              {entry.message && (
                <span className="log-page__message">{entry.message}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
