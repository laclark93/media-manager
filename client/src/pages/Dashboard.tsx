import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useSonarr } from '../hooks/useSonarr';
import { useRadarr } from '../hooks/useRadarr';
import { useJellyseerr } from '../hooks/useJellyseerr';
import { useSubtitleCheck } from '../hooks/useSubtitleCheck';
import { useSettings } from '../hooks/useSettings';
import { useIgnoredSubtitles } from '../hooks/useIgnoredSubtitles';
import { useHistory, HistorySnapshot } from '../hooks/useHistory';
import { StalenessLevel, DEFAULT_THRESHOLDS } from '../types/common';
import { getStaleness } from '../utils/staleness';
import './Dashboard.css';

export function Dashboard() {
  const navigate = useNavigate();
  const { series, loading: showsLoading } = useSonarr();
  const { movies, loading: moviesLoading } = useRadarr();
  const { issues, loading: issuesLoading } = useJellyseerr();
  const { items: subtitleItems, loading: subsLoading } = useSubtitleCheck();
  const { settings } = useSettings();
  const { ignoredKeys: ignoredSubKeys } = useIgnoredSubtitles();
  const { history, record } = useHistory();

  const visibleSubtitleItems = subtitleItems.filter(i => !ignoredSubKeys.has(`${i.service}-${i.id}`));

  const thresholds = settings?.stalenessThresholds ?? DEFAULT_THRESHOLDS;

  // Shows with missing episodes
  const showsWithMissing = series.filter(
    s => s.statistics.episodeCount - s.statistics.episodeFileCount > 0
  );
  const totalMissingEpisodes = showsWithMissing.reduce(
    (sum, s) => sum + (s.statistics.episodeCount - s.statistics.episodeFileCount), 0
  );

  // Movies missing files
  const missingMovies = movies.filter(m => !m.hasFile && m.isAvailable);

  // Staleness breakdown for shows (uses oldest missing episode air date for staleness)
  const showStaleness = { fresh: 0, stale: 0, veryStale: 0, ancient: 0 };
  for (const s of showsWithMissing) {
    const stalenessDate = s.oldestMissingAirDate || s.latestMissingAirDate || s.previousAiring;
    const level = getStaleness(s.dateAdded, thresholds, stalenessDate);
    if (level === StalenessLevel.Fresh) showStaleness.fresh++;
    else if (level === StalenessLevel.Stale) showStaleness.stale++;
    else if (level === StalenessLevel.VeryStale) showStaleness.veryStale++;
    else showStaleness.ancient++;
  }

  // Staleness breakdown for movies
  const movieStaleness = { fresh: 0, stale: 0, veryStale: 0, ancient: 0 };
  for (const m of missingMovies) {
    const release = m.physicalRelease || m.digitalRelease || m.inCinemas;
    const level = getStaleness(m.added, thresholds, release);
    if (level === StalenessLevel.Fresh) movieStaleness.fresh++;
    else if (level === StalenessLevel.Stale) movieStaleness.stale++;
    else if (level === StalenessLevel.VeryStale) movieStaleness.veryStale++;
    else movieStaleness.ancient++;
  }

  const cardClass = (count: number, loading: boolean) => {
    if (loading) return 'dashboard__card dashboard__card--loading';
    if (count === 0) return 'dashboard__card dashboard__card--zero';
    if (count >= 10) return 'dashboard__card dashboard__card--danger';
    return 'dashboard__card dashboard__card--warn';
  };

  const stalenessBar = (label: string, count: number, total: number, color: string) => (
    <div className="dashboard__bar-row" key={label}>
      <span className="dashboard__bar-label">{label}</span>
      <div className="dashboard__bar-track">
        <div
          className="dashboard__bar-fill"
          style={{
            width: total > 0 ? `${(count / total) * 100}%` : '0%',
            background: color,
          }}
        />
      </div>
      <span className="dashboard__bar-count">{count}</span>
    </div>
  );

  // Record history snapshot when data is available
  // Guard: only record when raw arrays are populated (avoids recording 0 when API returned empty/failed)
  useEffect(() => {
    if (!showsLoading && !moviesLoading && series.length > 0 && movies.length > 0) {
      record(showsWithMissing.length, missingMovies.length, totalMissingEpisodes);
    }
  }, [showsLoading, moviesLoading, series.length, movies.length, showsWithMissing.length, missingMovies.length, totalMissingEpisodes, record]);

  const allLoading = showsLoading && moviesLoading && issuesLoading && subsLoading;

  if (allLoading) {
    return <div className="page"><div className="loading">Loading dashboard</div></div>;
  }

  return (
    <div className="dashboard page">
      <h1 className="dashboard__title">Dashboard</h1>

      <div className="dashboard__cards">
        <div className={cardClass(showsWithMissing.length, showsLoading)} onClick={() => navigate('/shows')}>
          <div className="dashboard__card-header">
            <span className="dashboard__card-label">Shows Missing</span>
            <span className="dashboard__card-icon">📺</span>
          </div>
          <span className="dashboard__card-value">
            {showsLoading ? '—' : showsWithMissing.length}
          </span>
          <span className="dashboard__card-sub">
            {showsLoading ? 'Loading...' : `${totalMissingEpisodes} episode${totalMissingEpisodes !== 1 ? 's' : ''} total`}
          </span>
        </div>

        <div className={cardClass(missingMovies.length, moviesLoading)} onClick={() => navigate('/movies')}>
          <div className="dashboard__card-header">
            <span className="dashboard__card-label">Movies Missing</span>
            <span className="dashboard__card-icon">🎬</span>
          </div>
          <span className="dashboard__card-value">
            {moviesLoading ? '—' : missingMovies.length}
          </span>
          <span className="dashboard__card-sub">
            {moviesLoading ? 'Loading...' : `${movies.length} monitored total`}
          </span>
        </div>

        <div className={cardClass(issues.length, issuesLoading)} onClick={() => navigate('/issues')}>
          <div className="dashboard__card-header">
            <span className="dashboard__card-label">Open Issues</span>
            <span className="dashboard__card-icon">⚠️</span>
          </div>
          <span className="dashboard__card-value">
            {issuesLoading ? '—' : issues.length}
          </span>
          <span className="dashboard__card-sub">
            {issuesLoading ? 'Loading...' : 'Jellyseerr issues'}
          </span>
        </div>

        <div className={cardClass(visibleSubtitleItems.length, subsLoading)} onClick={() => navigate('/anime')}>
          <div className="dashboard__card-header">
            <span className="dashboard__card-label">Subtitle Issues</span>
            <span className="dashboard__card-icon">💬</span>
          </div>
          <span className="dashboard__card-value">
            {subsLoading ? '—' : visibleSubtitleItems.length}
          </span>
          <span className="dashboard__card-sub">
            {subsLoading ? 'Loading...' : 'Missing English subs'}
          </span>
        </div>
      </div>

      {/* Service Status */}
      {settings && (
        <div className="dashboard__services">
          <div className="dashboard__section-title">Services</div>
          <div className="dashboard__service-list">
            <div className="dashboard__service">
              <span className={`dashboard__service-dot ${settings.sonarrConfigured ? 'dashboard__service-dot--ok' : 'dashboard__service-dot--off'}`} />
              Sonarr
            </div>
            <div className="dashboard__service">
              <span className={`dashboard__service-dot ${settings.radarrConfigured ? 'dashboard__service-dot--ok' : 'dashboard__service-dot--off'}`} />
              Radarr
            </div>
            <div className="dashboard__service">
              <span className={`dashboard__service-dot ${settings.jellyseerrConfigured ? 'dashboard__service-dot--ok' : 'dashboard__service-dot--off'}`} />
              Jellyseerr
            </div>
            <div className="dashboard__service">
              <span className={`dashboard__service-dot ${settings.plexConfigured ? 'dashboard__service-dot--ok' : 'dashboard__service-dot--off'}`} />
              Plex
            </div>
          </div>
        </div>
      )}

      {/* Staleness Breakdown */}
      {!showsLoading && showsWithMissing.length > 0 && (
        <div className="dashboard__breakdown">
          <div className="dashboard__section-title">Shows Staleness</div>
          {stalenessBar('Fresh', showStaleness.fresh, showsWithMissing.length, 'var(--fresh)')}
          {stalenessBar('Stale', showStaleness.stale, showsWithMissing.length, 'var(--stale)')}
          {stalenessBar('Very Stale', showStaleness.veryStale, showsWithMissing.length, 'var(--very-stale)')}
          {stalenessBar('Ancient', showStaleness.ancient, showsWithMissing.length, 'var(--ancient)')}
        </div>
      )}

      {!moviesLoading && missingMovies.length > 0 && (
        <div className="dashboard__breakdown">
          <div className="dashboard__section-title">Movies Staleness</div>
          {stalenessBar('Fresh', movieStaleness.fresh, missingMovies.length, 'var(--fresh)')}
          {stalenessBar('Stale', movieStaleness.stale, missingMovies.length, 'var(--stale)')}
          {stalenessBar('Very Stale', movieStaleness.veryStale, missingMovies.length, 'var(--very-stale)')}
          {stalenessBar('Ancient', movieStaleness.ancient, missingMovies.length, 'var(--ancient)')}
        </div>
      )}

      {/* History Charts */}
      {history.length >= 2 && (
        <>
          <HistoryChart data={history} valueKey="shows" title="Missing Shows Over Time" color="var(--accent)" />
          <HistoryChart data={history} valueKey="movies" title="Missing Movies Over Time" color="var(--warning)" />
          {history.some(h => h.episodes !== undefined) && (
            <HistoryChart data={history} valueKey="episodes" title="Missing Episodes Over Time" color="var(--danger, #e74c3c)" />
          )}
        </>
      )}
    </div>
  );
}

/* ── History Line Chart ──────────────────────────────────── */
const CHART_W = 800;
const CHART_H = 260;
const PAD = { top: 20, right: 30, bottom: 50, left: 50 };

type Granularity = 'hourly' | 'daily' | 'monthly';

function bucketKey(d: Date, g: Granularity): string {
  if (g === 'hourly') return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  if (g === 'daily') return d.toISOString().slice(0, 10);  // YYYY-MM-DD
  return d.toISOString().slice(0, 7);                       // YYYY-MM
}

function bucketLabel(key: string, g: Granularity): string {
  if (g === 'monthly') {
    const [y, m] = key.split('-');
    return `${parseInt(m)}/${y}`;
  }
  const d = new Date(g === 'hourly' ? key + ':00:00Z' : key + 'T00:00:00Z');
  if (g === 'daily') return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:00`;
}

function aggregateData(
  raw: HistorySnapshot[],
  valueKey: 'shows' | 'movies' | 'episodes',
  granularity: Granularity,
): { ts: number; value: number; date: Date; label: string }[] {
  if (granularity === 'hourly') {
    return raw
      .filter(d => d[valueKey] !== undefined)
      .map(d => {
        const date = new Date(d.timestamp);
        return { ts: date.getTime(), value: d[valueKey]!, date, label: '' };
      });
  }

  const buckets = new Map<string, { values: number[]; ts: number }>();
  for (const d of raw) {
    const v = d[valueKey];
    if (v === undefined) continue;
    const date = new Date(d.timestamp);
    const key = bucketKey(date, granularity);
    const existing = buckets.get(key);
    if (existing) {
      existing.values.push(v);
      existing.ts = Math.max(existing.ts, date.getTime());
    } else {
      buckets.set(key, { values: [v], ts: date.getTime() });
    }
  }

  return Array.from(buckets.entries()).map(([key, { values, ts }]) => {
    // Use the last value in each bucket (most recent snapshot)
    const value = values[values.length - 1];
    return { ts, value, date: new Date(ts), label: bucketLabel(key, granularity) };
  });
}

function HistoryChart({ data, valueKey, title, color }: {
  data: HistorySnapshot[];
  valueKey: 'shows' | 'movies' | 'episodes';
  title: string;
  color: string;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; count: number } | null>(null);
  const [granularity, setGranularity] = useState<Granularity>(() => {
    const saved = localStorage.getItem(`chart.granularity.${valueKey}`);
    if (saved && ['hourly', 'daily', 'monthly'].includes(saved)) return saved as Granularity;
    return 'daily';
  });

  const setAndSaveGranularity = (g: Granularity) => {
    setGranularity(g);
    localStorage.setItem(`chart.granularity.${valueKey}`, g);
  };

  const points = useMemo(() => aggregateData(data, valueKey, granularity), [data, valueKey, granularity]);

  if (points.length < 2) return null;

  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const values = points.map(p => p.value);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values);
  const valRange = Math.max(maxVal - minVal, 1);
  const yMax = maxVal + Math.ceil(valRange * 0.1);
  const yMin = Math.max(0, minVal - Math.ceil(valRange * 0.1));
  const yRange = yMax - yMin || 1;

  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;
  const tsRange = maxTs - minTs || 1;

  const xScale = (ts: number) => PAD.left + ((ts - minTs) / tsRange) * plotW;
  const yScale = (v: number) => PAD.top + plotH - ((v - yMin) / yRange) * plotH;

  const linePoints = points.map(p => `${xScale(p.ts)},${yScale(p.value)}`).join(' ');
  const linePath = `M ${linePoints.replace(/ /g, ' L ')}`;
  const areaPath = `M ${xScale(minTs)},${yScale(yMin)} L ${linePoints.replace(/ /g, ' L ')} L ${xScale(maxTs)},${yScale(yMin)} Z`;

  // Y-axis ticks
  const yTicks: number[] = [];
  const step = Math.ceil(yRange / 5) || 1;
  for (let v = yMin; v <= yMax; v += step) yTicks.push(v);
  if (yTicks[yTicks.length - 1] < yMax) yTicks.push(yMax);

  // X-axis labels
  const xLabelCount = Math.min(points.length, 6);
  const xLabels: { ts: number; label: string }[] = [];
  for (let i = 0; i < xLabelCount; i++) {
    const idx = Math.round((i / (xLabelCount - 1)) * (points.length - 1));
    const p = points[idx];
    const d = p.date;
    let label: string;
    if (granularity === 'monthly') label = `${d.getMonth() + 1}/${d.getFullYear()}`;
    else if (granularity === 'daily') label = `${d.getMonth() + 1}/${d.getDate()}`;
    else label = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:00`;
    xLabels.push({ ts: p.ts, label });
  }

  const formatTooltipDate = (d: Date) => {
    if (granularity === 'monthly') return `${d.getMonth() + 1}/${d.getFullYear()}`;
    if (granularity === 'daily') return `${d.getMonth() + 1}/${d.getDate()}`;
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="dashboard__chart">
      <div className="dashboard__chart-header">
        <div className="dashboard__section-title">{title}</div>
        <div className="dashboard__granularity">
          {(['hourly', 'daily', 'monthly'] as Granularity[]).map(g => (
            <button
              key={g}
              className={`dashboard__granularity-btn${granularity === g ? ' dashboard__granularity-btn--active' : ''}`}
              onClick={() => setAndSaveGranularity(g)}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="dashboard__chart-wrap" style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="dashboard__chart-svg">
          {yTicks.map(v => (
            <line key={v} x1={PAD.left} y1={yScale(v)} x2={CHART_W - PAD.right} y2={yScale(v)} className="dashboard__chart-grid" />
          ))}
          <path d={areaPath} fill={color} opacity={0.12} />
          <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={xScale(p.ts)}
              cy={yScale(p.value)}
              r={points.length <= 30 ? 4 : 2.5}
              fill={color}
              className="dashboard__chart-dot"
              onMouseEnter={() => setTooltip({ x: xScale(p.ts), y: yScale(p.value), label: formatTooltipDate(p.date), count: p.value })}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
          {xLabels.map((l, i) => (
            <text key={i} x={xScale(l.ts)} y={CHART_H - 8} textAnchor="middle" className="dashboard__chart-axis">{l.label}</text>
          ))}
          {yTicks.map(v => (
            <text key={v} x={PAD.left - 8} y={yScale(v) + 4} textAnchor="end" className="dashboard__chart-axis">{v}</text>
          ))}
        </svg>
        {tooltip && (
          <div
            className="dashboard__chart-tooltip"
            style={{ left: `${(tooltip.x / CHART_W) * 100}%`, top: `${(tooltip.y / CHART_H) * 100}%` }}
          >
            <strong>{tooltip.label}</strong>: {tooltip.count}
          </div>
        )}
      </div>
    </div>
  );
}
