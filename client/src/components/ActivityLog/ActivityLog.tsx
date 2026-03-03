import { useState } from 'react';
import { useActivityLog } from '../../hooks/useActivityLog';
import './ActivityLog.css';

export function ActivityLog() {
  const { entries } = useActivityLog();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="activity-log">
      <div className="activity-log__header" onClick={() => setCollapsed(!collapsed)}>
        <span>
          <span className="activity-log__title">Activity Log</span>
          <span className="activity-log__count">({entries.length})</span>
        </span>
        <span className="activity-log__toggle">{collapsed ? '\u25B6' : '\u25BC'}</span>
      </div>
      {!collapsed && (
        <div className="activity-log__body">
          {entries.length === 0 ? (
            <div className="activity-log__empty">No activity yet</div>
          ) : (
            entries.map(entry => (
              <div key={entry.id} className="activity-log__entry">
                <span className={`activity-log__status activity-log__status--${entry.status}`} />
                <span className="activity-log__time">
                  {entry.timestamp.toLocaleTimeString()}
                </span>
                <span className="activity-log__action">{entry.action}</span>
                <span className="activity-log__target" title={entry.target}>{entry.target}</span>
                {entry.message && (
                  <span className="activity-log__message">{entry.message}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
