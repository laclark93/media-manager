import { useState, useEffect, useMemo, useRef } from 'react';
import { MissingTimelineEntry } from '../../types/sonarr';
import './MissingTimeline.css';

type TimelineView = 'histogram' | 'grid' | 'cumulative' | 'years' | 'shows';

const VIEW_LABELS: { key: TimelineView; label: string }[] = [
  { key: 'histogram', label: 'Monthly' },
  { key: 'grid', label: 'Season Grid' },
  { key: 'cumulative', label: 'Cumulative' },
  { key: 'years', label: 'By Year' },
  { key: 'shows', label: 'By Show' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MissingTimelineProps {
  getMissingTimeline: () => Promise<MissingTimelineEntry[]>;
}

/* ────────────────────────────────────────────────────────── */
/*  Summary Stats                                            */
/* ────────────────────────────────────────────────────────── */
function SummaryStats({ entries }: { entries: MissingTimelineEntry[] }) {
  const stats = useMemo(() => {
    const uniqueShows = new Set(entries.map(e => e.seriesId)).size;
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const recentCount = entries.filter(e => new Date(e.airDateUtc) >= oneYearAgo).length;
    const olderCount = entries.length - recentCount;
    const sorted = [...entries].sort((a, b) => a.airDateUtc.localeCompare(b.airDateUtc));
    const medianDate = new Date(sorted[Math.floor(sorted.length / 2)].airDateUtc);
    const medianLabel = `${MONTH_NAMES[medianDate.getMonth()]} ${medianDate.getFullYear()}`;
    return { total: entries.length, uniqueShows, recentCount, olderCount, medianLabel };
  }, [entries]);

  return (
    <div className="timeline__summary">
      <div className="timeline__stat">
        <span className="timeline__stat-value">{stats.total}</span>
        <span className="timeline__stat-label">Missing Episodes</span>
      </div>
      <div className="timeline__stat">
        <span className="timeline__stat-value">{stats.uniqueShows}</span>
        <span className="timeline__stat-label">Shows</span>
      </div>
      <div className="timeline__stat">
        <span className="timeline__stat-value">{stats.recentCount}</span>
        <span className="timeline__stat-label">Last 12 Months</span>
      </div>
      <div className="timeline__stat">
        <span className="timeline__stat-value">{stats.olderCount}</span>
        <span className="timeline__stat-label">Older Than 1 Year</span>
      </div>
      <div className="timeline__stat">
        <span className="timeline__stat-value">{stats.medianLabel}</span>
        <span className="timeline__stat-label">Median Air Date</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  View A: Monthly Histogram                                */
/* ────────────────────────────────────────────────────────── */
interface MonthBucket {
  key: string;
  label: string;
  year: number;
  month: number;
  count: number;
  shows: Map<string, number>;
}

function MonthlyHistogram({ entries }: { entries: MissingTimelineEntry[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const buckets = useMemo(() => {
    const map = new Map<string, MonthBucket>();
    for (const ep of entries) {
      if (!ep.airDateUtc) continue;
      const d = new Date(ep.airDateUtc);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      let b = map.get(key);
      if (!b) {
        b = { key, label: `${MONTH_NAMES[month]} ${year}`, year, month, count: 0, shows: new Map() };
        map.set(key, b);
      }
      b.count++;
      b.shows.set(ep.seriesTitle, (b.shows.get(ep.seriesTitle) ?? 0) + 1);
    }
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [entries]);

  const maxCount = useMemo(() => Math.max(...buckets.map(b => b.count), 1), [buckets]);

  let lastYear = 0;
  return (
    <div className="timeline__chart">
      {buckets.map(bucket => {
        const showYear = bucket.year !== lastYear;
        lastYear = bucket.year;
        const pct = (bucket.count / maxCount) * 100;
        const isExp = expanded === bucket.key;
        const showsByCount = isExp
          ? Array.from(bucket.shows.entries()).sort((a, b) => b[1] - a[1])
          : [];
        return (
          <div key={bucket.key}>
            {showYear && <div className="timeline__year-sep">{bucket.year}</div>}
            <div className="timeline__row" onClick={() => setExpanded(isExp ? null : bucket.key)}>
              <span className="timeline__month-label">{MONTH_NAMES[bucket.month]}</span>
              <div className="timeline__bar-track">
                <div className="timeline__bar" style={{ width: `${Math.max(pct, 1)}%` }} />
              </div>
              <span className="timeline__bar-count">{bucket.count}</span>
            </div>
            {isExp && (
              <div className="timeline__detail">
                {showsByCount.map(([title, count]) => (
                  <div key={title} className="timeline__detail-show">
                    <span className="timeline__detail-show-title">{title}</span>
                    <span className="timeline__detail-show-count">{count} ep{count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  View B: Season Grid                                      */
/* ────────────────────────────────────────────────────────── */
interface ShowSeasonData {
  title: string;
  seasons: Map<number, number>; // seasonNumber -> missing count
  totalMissing: number;
}

function SeasonGrid({ entries }: { entries: MissingTimelineEntry[] }) {
  const { shows, maxSeason } = useMemo(() => {
    const map = new Map<number, ShowSeasonData>();
    let max = 0;
    for (const ep of entries) {
      let show = map.get(ep.seriesId);
      if (!show) {
        show = { title: ep.seriesTitle, seasons: new Map(), totalMissing: 0 };
        map.set(ep.seriesId, show);
      }
      show.seasons.set(ep.seasonNumber, (show.seasons.get(ep.seasonNumber) ?? 0) + 1);
      show.totalMissing++;
      if (ep.seasonNumber > max) max = ep.seasonNumber;
    }
    const arr = Array.from(map.values()).sort((a, b) => b.totalMissing - a.totalMissing);
    return { shows: arr, maxSeason: max };
  }, [entries]);

  const seasonNums = Array.from({ length: maxSeason + 1 }, (_, i) => i).filter(s =>
    shows.some(sh => sh.seasons.has(s))
  );

  const cellClass = (count: number) => {
    if (count === 0) return 'season-grid__cell season-grid__cell--none';
    if (count <= 3) return 'season-grid__cell season-grid__cell--low';
    if (count <= 10) return 'season-grid__cell season-grid__cell--mid';
    return 'season-grid__cell season-grid__cell--high';
  };

  return (
    <div className="season-grid">
      <div className="season-grid__header">
        {seasonNums.map(s => (
          <span key={s} className="season-grid__header-cell">S{s}</span>
        ))}
      </div>
      {shows.map(show => (
        <div key={show.title} className="season-grid__row">
          <span className="season-grid__title" title={show.title}>{show.title}</span>
          <div className="season-grid__cells">
            {seasonNums.map(s => {
              const count = show.seasons.get(s) ?? 0;
              return (
                <span
                  key={s}
                  className={cellClass(count)}
                  title={count > 0 ? `S${s}: ${count} missing` : `S${s}: complete`}
                >
                  {count > 0 ? count : ''}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  View C: Cumulative Timeline (SVG)                        */
/* ────────────────────────────────────────────────────────── */
function CumulativeTimeline({ entries }: { entries: MissingTimelineEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.airDateUtc.localeCompare(b.airDateUtc)),
    [entries]
  );

  const points = useMemo(() => {
    if (sorted.length === 0) return [];
    // Bucket by month for smoother lines
    const map = new Map<string, number>();
    let cumulative = 0;
    for (const ep of sorted) {
      const d = new Date(ep.airDateUtc);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      cumulative++;
      map.set(key, cumulative);
    }
    return Array.from(map.entries()).map(([key, total]) => ({
      key,
      date: new Date(key + '-15'),
      total,
    }));
  }, [sorted]);

  if (points.length < 2) return <div className="cumulative"><p style={{ color: 'var(--text-muted)', padding: 20 }}>Not enough data for chart.</p></div>;

  const W = 800;
  const H = 300;
  const PAD = { top: 20, right: 30, bottom: 40, left: 50 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const minTime = points[0].date.getTime();
  const maxTime = points[points.length - 1].date.getTime();
  const timeRange = maxTime - minTime || 1;
  const maxTotal = points[points.length - 1].total;

  const xScale = (t: number) => PAD.left + ((t - minTime) / timeRange) * innerW;
  const yScale = (v: number) => PAD.top + innerH - (v / maxTotal) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.date.getTime())},${yScale(p.total)}`).join(' ');
  const areaPath = linePath + ` L${xScale(maxTime)},${yScale(0)} L${xScale(minTime)},${yScale(0)} Z`;

  // Year tick marks
  const startYear = points[0].date.getFullYear();
  const endYear = points[points.length - 1].date.getFullYear();
  const yearTicks: { x: number; label: string }[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const t = new Date(y, 0, 1).getTime();
    if (t >= minTime && t <= maxTime) {
      yearTicks.push({ x: xScale(t), label: String(y) });
    }
  }

  // Horizontal grid lines
  const gridLines: number[] = [];
  const step = Math.ceil(maxTotal / 5 / 10) * 10 || 10;
  for (let v = step; v < maxTotal; v += step) {
    gridLines.push(v);
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    if (mx < PAD.left || mx > W - PAD.right || my < PAD.top || my > H - PAD.bottom) {
      setTooltip(null);
      return;
    }
    const time = minTime + ((mx - PAD.left) / innerW) * timeRange;
    // Find closest point
    let closest = points[0];
    let closestDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(p.date.getTime() - time);
      if (dist < closestDist) { closestDist = dist; closest = p; }
    }
    const d = closest.date;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 30,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}: ${closest.total} total missing`,
    });
  };

  return (
    <div className="cumulative" ref={containerRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="cumulative__svg" onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>
        {gridLines.map(v => (
          <g key={v}>
            <line className="cumulative__grid-line" x1={PAD.left} x2={W - PAD.right} y1={yScale(v)} y2={yScale(v)} />
            <text className="cumulative__axis-label" x={PAD.left - 6} y={yScale(v) + 4} textAnchor="end">{v}</text>
          </g>
        ))}
        <path d={areaPath} className="cumulative__area" />
        <path d={linePath} className="cumulative__line" />
        {yearTicks.map(t => (
          <g key={t.label}>
            <line className="cumulative__grid-line" x1={t.x} x2={t.x} y1={PAD.top} y2={H - PAD.bottom} />
            <text className="cumulative__axis-label" x={t.x} y={H - PAD.bottom + 16} textAnchor="middle">{t.label}</text>
          </g>
        ))}
        <text className="cumulative__axis-label" x={PAD.left - 6} y={yScale(maxTotal) + 4} textAnchor="end">{maxTotal}</text>
      </svg>
      {tooltip && (
        <div className="cumulative__tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.label}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  View D: Year Summary Cards                               */
/* ────────────────────────────────────────────────────────── */
function YearCards({ entries }: { entries: MissingTimelineEntry[] }) {
  const years = useMemo(() => {
    const map = new Map<number, { count: number; shows: Map<string, number> }>();
    for (const ep of entries) {
      if (!ep.airDateUtc) continue;
      const year = new Date(ep.airDateUtc).getFullYear();
      let y = map.get(year);
      if (!y) { y = { count: 0, shows: new Map() }; map.set(year, y); }
      y.count++;
      y.shows.set(ep.seriesTitle, (y.shows.get(ep.seriesTitle) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, data]) => ({
        year,
        count: data.count,
        topShows: Array.from(data.shows.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      }));
  }, [entries]);

  const maxCount = Math.max(...years.map(y => y.count), 1);

  return (
    <div className="year-cards">
      {years.map(y => (
        <div key={y.year} className="year-card">
          <div className="year-card__year">{y.year}</div>
          <div className="year-card__count">{y.count} missing episode{y.count !== 1 ? 's' : ''}</div>
          <div className="year-card__bar-track">
            <div className="year-card__bar" style={{ width: `${(y.count / maxCount) * 100}%` }} />
          </div>
          <div className="year-card__shows">
            {y.topShows.map(([title, count]) => (
              <div key={title} className="year-card__show-row">
                <span className="year-card__show-name" title={title}>{title}</span>
                <span className="year-card__show-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  View E: Show-grouped Timeline                            */
/* ────────────────────────────────────────────────────────── */
interface ShowRange {
  title: string;
  count: number;
  minTime: number;
  maxTime: number;
  dates: number[];
}

function ShowTimeline({ entries }: { entries: MissingTimelineEntry[] }) {
  const { shows, globalMin, globalMax } = useMemo(() => {
    const map = new Map<number, ShowRange>();
    let gMin = Infinity, gMax = -Infinity;
    for (const ep of entries) {
      if (!ep.airDateUtc) continue;
      const t = new Date(ep.airDateUtc).getTime();
      if (t < gMin) gMin = t;
      if (t > gMax) gMax = t;
      let s = map.get(ep.seriesId);
      if (!s) {
        s = { title: ep.seriesTitle, count: 0, minTime: t, maxTime: t, dates: [] };
        map.set(ep.seriesId, s);
      }
      s.count++;
      s.dates.push(t);
      if (t < s.minTime) s.minTime = t;
      if (t > s.maxTime) s.maxTime = t;
    }
    const arr = Array.from(map.values()).sort((a, b) => b.count - a.count);
    return { shows: arr, globalMin: gMin, globalMax: gMax };
  }, [entries]);

  const range = globalMax - globalMin || 1;
  const toPct = (t: number) => ((t - globalMin) / range) * 100;

  // Year markers
  const startYear = new Date(globalMin).getFullYear();
  const endYear = new Date(globalMax).getFullYear();
  const yearMarkers: { pct: number; label: string }[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const t = new Date(y, 0, 1).getTime();
    if (t >= globalMin && t <= globalMax) {
      yearMarkers.push({ pct: toPct(t), label: String(y) });
    }
  }

  return (
    <div className="show-timeline">
      <div className="show-timeline__year-markers" style={{ flex: 1, position: 'relative', height: 16 }}>
        {yearMarkers.map(m => (
          <span key={m.label} className="show-timeline__year-label" style={{ left: `${m.pct}%` }}>
            {m.label}
          </span>
        ))}
      </div>
      {shows.map(show => (
        <div key={show.title} className="show-timeline__row">
          <span className="show-timeline__title" title={show.title}>{show.title}</span>
          <div className="show-timeline__bar-area">
            <div
              className="show-timeline__range"
              style={{
                left: `${toPct(show.minTime)}%`,
                width: `${Math.max(toPct(show.maxTime) - toPct(show.minTime), 0.5)}%`,
              }}
            />
            {show.dates.map((t, i) => (
              <div
                key={i}
                className="show-timeline__dot"
                style={{ left: `${toPct(t)}%` }}
                title={new Date(t).toLocaleDateString()}
              />
            ))}
          </div>
          <span className="show-timeline__count">{show.count}</span>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  Main component                                           */
/* ────────────────────────────────────────────────────────── */
export function MissingTimeline({ getMissingTimeline }: MissingTimelineProps) {
  const [entries, setEntries] = useState<MissingTimelineEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TimelineView>('histogram');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMissingTimeline()
      .then(data => { if (!cancelled) { setEntries(data); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [getMissingTimeline]);

  if (loading) return <div className="timeline__loading loading">Loading timeline</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!entries || entries.length === 0) {
    return (
      <div className="empty-state">
        <h2>No Missing Episodes</h2>
        <p>All monitored episodes have been downloaded.</p>
      </div>
    );
  }

  return (
    <div>
      <SummaryStats entries={entries} />

      <div className="timeline-views">
        {VIEW_LABELS.map(v => (
          <button
            key={v.key}
            className={`timeline-views__btn${view === v.key ? ' timeline-views__btn--active' : ''}`}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'histogram' && <MonthlyHistogram entries={entries} />}
      {view === 'grid' && <SeasonGrid entries={entries} />}
      {view === 'cumulative' && <CumulativeTimeline entries={entries} />}
      {view === 'years' && <YearCards entries={entries} />}
      {view === 'shows' && <ShowTimeline entries={entries} />}
    </div>
  );
}
