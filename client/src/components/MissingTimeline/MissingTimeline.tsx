import { useState, useEffect, useMemo, useRef } from 'react';
import { MissingTimelineEntry } from '../../types/sonarr';
import './MissingTimeline.css';

type TimelineView = 'histogram' | 'grid' | 'yearly' | 'byYear' | 'shows' | 'calendar';

const VIEW_LABELS: { key: TimelineView; label: string }[] = [
  { key: 'histogram', label: 'Monthly' },
  { key: 'grid', label: 'Season Grid' },
  { key: 'yearly', label: 'Yearly' },
  { key: 'byYear', label: 'By Year' },
  { key: 'shows', label: 'By Show' },
  { key: 'calendar', label: 'Calendar' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Returns true if the date is a Unix epoch placeholder (12/31/1969 or 1/1/1970) */
function isEpochDate(dateStr: string): boolean {
  if (!dateStr) return true;
  const t = new Date(dateStr).getTime();
  // Within 48 hours of Unix epoch = placeholder
  return Math.abs(t) < 48 * 60 * 60 * 1000;
}

// Generate distinct colors for show segments — handles any number of shows
const SEED_COLORS = [
  '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#d35400', '#27ae60',
  '#8e44ad', '#c0392b', '#16a085', '#f1c40f', '#2980b9',
  '#7f8c8d', '#e84393', '#00cec9', '#fdcb6e', '#6c5ce7',
];

/** Returns a visually distinct color for a given index. Uses seed colors first, then generates via golden-angle HSL. */
function getShowColor(index: number): string {
  if (index < SEED_COLORS.length) return SEED_COLORS[index];
  // Golden angle (~137.5°) produces well-distributed hues
  const hue = (index * 137.508) % 360;
  const saturation = 55 + (index % 3) * 10; // 55%, 65%, 75%
  const lightness = 45 + (index % 4) * 5;   // 45%, 50%, 55%, 60%
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

interface MissingTimelineProps {
  getMissingTimeline: () => Promise<MissingTimelineEntry[]>;
}

/* ────────────────────────────────────────────────────────── */
/*  Filter out epoch dates                                    */
/* ────────────────────────────────────────────────────────── */
function filterEpochDates(entries: MissingTimelineEntry[]): MissingTimelineEntry[] {
  return entries.filter(e => !isEpochDate(e.airDateUtc));
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
/*  - Bar left of month label, year total next to year       */
/*  - Stacked bar segmented per show                         */
/*  - Asc/desc toggle                                        */
/*  - Detail: count next to show name, ordered by count      */
/* ────────────────────────────────────────────────────────── */
interface MonthBucket {
  key: string;
  year: number;
  month: number;
  count: number;
  shows: Map<string, number>;
}

function MonthlyHistogram({ entries }: { entries: MissingTimelineEntry[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ascending, setAscending] = useState(true);

  // Build a stable color map for show titles
  const showColorMap = useMemo(() => {
    const countByShow = new Map<string, number>();
    for (const ep of entries) {
      countByShow.set(ep.seriesTitle, (countByShow.get(ep.seriesTitle) ?? 0) + 1);
    }
    const sorted = Array.from(countByShow.entries()).sort((a, b) => b[1] - a[1]);
    const map = new Map<string, string>();
    sorted.forEach(([title], i) => map.set(title, getShowColor(i)));
    return map;
  }, [entries]);

  const { buckets, yearTotals } = useMemo(() => {
    const map = new Map<string, MonthBucket>();
    const yTotals = new Map<number, number>();
    for (const ep of entries) {
      if (!ep.airDateUtc) continue;
      const d = new Date(ep.airDateUtc);
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      let b = map.get(key);
      if (!b) {
        b = { key, year, month, count: 0, shows: new Map() };
        map.set(key, b);
      }
      b.count++;
      b.shows.set(ep.seriesTitle, (b.shows.get(ep.seriesTitle) ?? 0) + 1);
      yTotals.set(year, (yTotals.get(year) ?? 0) + 1);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => ascending ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key));
    return { buckets: arr, yearTotals: yTotals };
  }, [entries, ascending]);

  const maxCount = useMemo(() => Math.max(...buckets.map(b => b.count), 1), [buckets]);

  let lastYear = 0;
  return (
    <div className="timeline__chart">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          className="timeline-views__btn timeline-views__btn--active"
          style={{ padding: '4px 10px', fontSize: '0.72rem', borderRadius: 4 }}
          onClick={() => setAscending(v => !v)}
          title={ascending ? 'Oldest first' : 'Newest first'}
        >
          {ascending ? '↑ Oldest first' : '↓ Newest first'}
        </button>
      </div>
      {buckets.map(bucket => {
        const showYear = bucket.year !== lastYear;
        lastYear = bucket.year;
        const pct = (bucket.count / maxCount) * 100;
        const isExp = expanded === bucket.key;
        const showsByCount = isExp
          ? Array.from(bucket.shows.entries()).sort((a, b) => b[1] - a[1])
          : [];

        // Build stacked bar segments
        const showsSorted = Array.from(bucket.shows.entries()).sort((a, b) => b[1] - a[1]);
        const segments = showsSorted.map(([title, count]) => ({
          title,
          count,
          pct: (count / bucket.count) * pct,
          color: showColorMap.get(title) ?? getShowColor(0),
        }));

        return (
          <div key={bucket.key}>
            {showYear && (
              <div className="timeline__year-sep">
                {bucket.year}
                <span className="timeline__year-total">{yearTotals.get(bucket.year) ?? 0}</span>
              </div>
            )}
            <div className="timeline__row" onClick={() => setExpanded(isExp ? null : bucket.key)}>
              <span className="timeline__month-label">{MONTH_NAMES[bucket.month]}</span>
              <span className="timeline__bar-count">{bucket.count}</span>
              <div className="timeline__bar-track">
                <div className="timeline__bar-stacked" style={{ width: `${Math.max(pct, 1)}%` }}>
                  {segments.map((seg, i) => (
                    <div
                      key={i}
                      className="timeline__bar-segment"
                      style={{
                        width: `${(seg.count / bucket.count) * 100}%`,
                        background: seg.color,
                      }}
                      title={`${seg.title}: ${seg.count}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            {isExp && (
              <div className="timeline__detail">
                {showsByCount.map(([title, count]) => (
                  <div key={title} className="timeline__detail-show">
                    <span
                      className="timeline__detail-color"
                      style={{ background: showColorMap.get(title) ?? getShowColor(0) }}
                    />
                    <span className="timeline__detail-show-count">{count}</span>
                    <span className="timeline__detail-show-title">{title}</span>
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
  seasons: Map<number, number>;
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
/*  View C: Yearly Line/Area Chart (SVG)                     */
/*  - X-axis: year, Y-axis: total missing for that year      */
/* ────────────────────────────────────────────────────────── */
const CHART_W = 800;
const CHART_H = 300;
const CHART_PAD = { top: 20, right: 30, bottom: 40, left: 50 };

function YearlyAreaChart({ entries }: { entries: MissingTimelineEntry[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; year: number; count: number } | null>(null);

  const years = useMemo(() => {
    const map = new Map<number, number>();
    for (const ep of entries) {
      if (!ep.airDateUtc) continue;
      const year = new Date(ep.airDateUtc).getFullYear();
      map.set(year, (map.get(year) ?? 0) + 1);
    }
    const sorted = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    // Fill gaps so the line is continuous
    if (sorted.length < 2) return sorted.map(([year, count]) => ({ year, count }));
    const result: { year: number; count: number }[] = [];
    for (let y = sorted[0][0]; y <= sorted[sorted.length - 1][0]; y++) {
      result.push({ year: y, count: map.get(y) ?? 0 });
    }
    return result;
  }, [entries]);

  if (years.length === 0) return null;

  const maxCount = Math.max(...years.map(y => y.count), 1);
  const plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;

  const xScale = (i: number) => CHART_PAD.left + (years.length > 1 ? (i / (years.length - 1)) * plotW : plotW / 2);
  const yScale = (v: number) => CHART_PAD.top + plotH - (v / maxCount) * plotH;

  // Build SVG path for line and area
  const linePoints = years.map((y, i) => `${xScale(i)},${yScale(y.count)}`).join(' ');
  const linePath = `M ${linePoints.replace(/ /g, ' L ')}`;
  const areaPath = `M ${xScale(0)},${yScale(0)} L ${linePoints.replace(/ /g, ' L ')} L ${xScale(years.length - 1)},${yScale(0)} Z`;

  // Y-axis ticks (roughly 5)
  const yTicks: number[] = [];
  const step = Math.ceil(maxCount / 5);
  for (let v = 0; v <= maxCount; v += step) yTicks.push(v);
  if (yTicks[yTicks.length - 1] < maxCount) yTicks.push(maxCount);

  return (
    <div className="yearly-chart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="yearly-chart__svg">
        {/* Grid lines */}
        {yTicks.map(v => (
          <line key={v} x1={CHART_PAD.left} y1={yScale(v)} x2={CHART_W - CHART_PAD.right} y2={yScale(v)} className="yearly-chart__grid" />
        ))}
        {/* Area */}
        <path d={areaPath} className="yearly-chart__area" />
        {/* Line */}
        <path d={linePath} className="yearly-chart__line" />
        {/* Data points */}
        {years.map((y, i) => (
          <circle
            key={y.year}
            cx={xScale(i)}
            cy={yScale(y.count)}
            r={4}
            className="yearly-chart__dot"
            onMouseEnter={() => setTooltip({ x: xScale(i), y: yScale(y.count), year: y.year, count: y.count })}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
        {/* X-axis labels */}
        {years.map((y, i) => (
          // Show every year if <=15, otherwise every other
          (years.length <= 15 || i % 2 === 0 || i === years.length - 1) ? (
            <text key={y.year} x={xScale(i)} y={CHART_H - 8} textAnchor="middle" className="yearly-chart__axis-label">{y.year}</text>
          ) : null
        ))}
        {/* Y-axis labels */}
        {yTicks.map(v => (
          <text key={v} x={CHART_PAD.left - 8} y={yScale(v) + 4} textAnchor="end" className="yearly-chart__axis-label">{v}</text>
        ))}
      </svg>
      {tooltip && (
        <div
          className="yearly-chart__tooltip"
          style={{ left: `${(tooltip.x / CHART_W) * 100}%`, top: `${(tooltip.y / CHART_H) * 100}%` }}
        >
          <strong>{tooltip.year}</strong>: {tooltip.count} missing
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  View D: By Year Cards with per-show bar graphs           */
/* ────────────────────────────────────────────────────────── */
interface YearShowData {
  title: string;
  count: number;
  color: string;
}

const BY_YEAR_VISIBLE_BARS = 6;

function ByYearCards({ entries }: { entries: MissingTimelineEntry[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const showColorMap = useMemo(() => {
    const countByShow = new Map<string, number>();
    for (const ep of entries) {
      countByShow.set(ep.seriesTitle, (countByShow.get(ep.seriesTitle) ?? 0) + 1);
    }
    const sorted = Array.from(countByShow.entries()).sort((a, b) => b[1] - a[1]);
    const map = new Map<string, string>();
    sorted.forEach(([title], i) => map.set(title, getShowColor(i)));
    return map;
  }, [entries]);

  const yearData = useMemo(() => {
    const byYear = new Map<number, Map<string, number>>();
    for (const ep of entries) {
      if (!ep.airDateUtc) continue;
      const year = new Date(ep.airDateUtc).getFullYear();
      let shows = byYear.get(year);
      if (!shows) { shows = new Map(); byYear.set(year, shows); }
      shows.set(ep.seriesTitle, (shows.get(ep.seriesTitle) ?? 0) + 1);
    }
    const result: { year: number; total: number; shows: YearShowData[] }[] = [];
    for (const [year, shows] of byYear.entries()) {
      const showArr: YearShowData[] = Array.from(shows.entries())
        .map(([title, count]) => ({ title, count, color: showColorMap.get(title) ?? getShowColor(0) }))
        .sort((a, b) => b.count - a.count);
      result.push({ year, total: showArr.reduce((s, x) => s + x.count, 0), shows: showArr });
    }
    result.sort((a, b) => b.year - a.year);
    return result;
  }, [entries, showColorMap]);

  return (
    <div className="by-year-cards">
      {yearData.map(yd => {
        const isExp = expanded === yd.year;
        const visibleShows = yd.shows.slice(0, BY_YEAR_VISIBLE_BARS);
        const maxInCard = Math.max(...yd.shows.map(s => s.count), 1);
        const hasMore = yd.shows.length > BY_YEAR_VISIBLE_BARS;
        return (
          <div key={yd.year} className="by-year-card" onClick={() => setExpanded(isExp ? null : yd.year)}>
            <div className="by-year-card__header">
              <span className="by-year-card__year">{yd.year}</span>
              <span className="by-year-card__total">{yd.total} missing</span>
              <span className="by-year-card__shows-count">{yd.shows.length} shows</span>
            </div>
            <div className="by-year-card__chart">
              {visibleShows.map(show => (
                <div key={show.title} className="by-year-card__bar-col" title={`${show.title}: ${show.count}`}>
                  <div className="by-year-card__bar-wrapper">
                    <div
                      className="by-year-card__bar"
                      style={{
                        height: `${(show.count / maxInCard) * 100}%`,
                        background: show.color,
                      }}
                    />
                  </div>
                  <span className="by-year-card__bar-count">{show.count}</span>
                </div>
              ))}
            </div>
            {hasMore && !isExp && (
              <div className="by-year-card__more">+{yd.shows.length - BY_YEAR_VISIBLE_BARS} more</div>
            )}
            {isExp && (
              <div className="by-year-card__detail">
                {yd.shows.map(show => (
                  <div key={show.title} className="timeline__detail-show">
                    <span className="timeline__detail-color" style={{ background: show.color }} />
                    <span className="timeline__detail-show-count">{show.count}</span>
                    <span className="timeline__detail-show-title">{show.title}</span>
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
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const startYear = new Date(globalMin).getFullYear();
  const endYear = new Date(globalMax).getFullYear();
  const yearSpan = endYear - startYear + 1;
  const timelineWidth = Math.max(yearSpan * 120, 600);

  const range = globalMax - globalMin || 1;
  const toPct = (t: number) => ((t - globalMin) / range) * 100;

  const yearMarkers: { pct: number; label: string }[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const t = new Date(y, 0, 1).getTime();
    if (t >= globalMin && t <= globalMax) {
      yearMarkers.push({ pct: toPct(t), label: String(y) });
    }
  }

  // Scroll to the right (latest years) on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [shows]);

  return (
    <div className="show-timeline">
      <div className="show-timeline__fixed">
        <div className="show-timeline__year-spacer" />
        {shows.map(show => (
          <div key={show.title} className="show-timeline__title-row">
            <span className="show-timeline__title" title={show.title}>{show.title}</span>
            <span className="show-timeline__count">{show.count}</span>
          </div>
        ))}
      </div>
      <div className="show-timeline__scroll" ref={scrollRef}>
        <div className="show-timeline__scroll-inner" style={{ minWidth: timelineWidth }}>
          <div className="show-timeline__year-markers">
            {yearMarkers.map(m => (
              <span key={m.label} className="show-timeline__year-label" style={{ left: `${m.pct}%` }}>
                {m.label}
              </span>
            ))}
          </div>
          {shows.map(show => (
            <div key={show.title} className="show-timeline__bar-row">
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  View F: Calendar (12-month year view)                     */
/* ────────────────────────────────────────────────────────── */
const DAY_HEADERS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

interface CalendarCell { day: number; key: string; count: number }

function buildMonthGrid(year: number, month: number, dateMap: Map<string, MissingTimelineEntry[]>): { weeks: CalendarCell[][]; total: number } {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: CalendarCell[][] = [];
  let currentWeek: CalendarCell[] = [];
  let total = 0;

  for (let i = 0; i < firstDay; i++) currentWeek.push({ day: 0, key: '', count: 0 });

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const count = dateMap.get(key)?.length ?? 0;
    total += count;
    currentWeek.push({ day: d, key, count });
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push({ day: 0, key: '', count: 0 });
    weeks.push(currentWeek);
  }

  return { weeks, total };
}

function CalendarView({ entries }: { entries: MissingTimelineEntry[] }) {
  const { minDate, maxDate, dateMap, globalMaxDay } = useMemo(() => {
    const map = new Map<string, MissingTimelineEntry[]>();
    let min = Infinity, max = -Infinity;
    const dayCounts = new Map<string, number>();
    for (const ep of entries) {
      if (!ep.airDateUtc) continue;
      const d = new Date(ep.airDateUtc);
      const t = d.getTime();
      if (t < min) min = t;
      if (t > max) max = t;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const arr = map.get(key);
      if (arr) arr.push(ep);
      else map.set(key, [ep]);
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    }
    let gMax = 1;
    for (const c of dayCounts.values()) { if (c > gMax) gMax = c; }
    return { minDate: new Date(min), maxDate: new Date(max), dateMap: map, globalMaxDay: gMax };
  }, [entries]);

  const [year, setYear] = useState(() => maxDate.getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const minYear = minDate.getFullYear();
  const maxYear = maxDate.getFullYear();

  const yearTotal = useMemo(() => {
    let t = 0;
    for (const [key, arr] of dateMap.entries()) {
      if (key.startsWith(String(year) + '-')) t += arr.length;
    }
    return t;
  }, [year, dateMap]);

  const selectedEntries = selectedDay ? dateMap.get(selectedDay) ?? [] : [];

  return (
    <div className="calendar">
      <div className="calendar__nav">
        <button className="calendar__nav-btn" onClick={() => setYear((y: number) => y - 1)} disabled={year <= minYear}>&lt;</button>
        <div className="calendar__nav-center">
          <select className="calendar__select" value={year} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setYear(Number(e.target.value))}>
            {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span className="calendar__month-total">{yearTotal} missing</span>
        </div>
        <button className="calendar__nav-btn" onClick={() => setYear((y: number) => y + 1)} disabled={year >= maxYear}>&gt;</button>
      </div>

      <div className="calendar__heatmap-legend">
        <span className="calendar__legend-label">Less</span>
        <div className="calendar__legend-scale">
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map(v => (
            <div key={v} className="calendar__legend-swatch" style={{ background: `hsl(${120 - 120 * v}, 65%, 42%)` }} />
          ))}
        </div>
        <span className="calendar__legend-label">More</span>
        <span className="calendar__legend-max">max: {globalMaxDay}/day</span>
      </div>

      <div className="calendar__year-grid">
        {Array.from({ length: 12 }, (_, monthIdx) => {
          const now = new Date();
          // Skip months past the current date
          if (year > now.getFullYear() || (year === now.getFullYear() && monthIdx > now.getMonth())) return null;
          const { weeks, total } = buildMonthGrid(year, monthIdx, dateMap);
          return (
            <div key={monthIdx} className="calendar__mini-month">
              <div className="calendar__mini-header">
                <span className="calendar__mini-month-name">{MONTH_NAMES_FULL[monthIdx]}</span>
                {total > 0 && <span className="calendar__mini-month-count">{total}</span>}
              </div>
              <div className="calendar__mini-grid">
                {DAY_HEADERS_SHORT.map((d, i) => (
                  <div key={i} className="calendar__mini-day-header">{d}</div>
                ))}
                {weeks.flat().map((cell, i) => (
                  <div
                    key={i}
                    className={`calendar__mini-cell${cell.day === 0 ? ' calendar__mini-cell--empty' : ''}${cell.count > 0 ? ' calendar__mini-cell--has' : ''}${cell.key === selectedDay ? ' calendar__mini-cell--selected' : ''}`}
                    onClick={() => cell.day > 0 && cell.count > 0 && setSelectedDay(cell.key === selectedDay ? null : cell.key)}
                    style={cell.count > 0 ? { '--intensity': cell.count / globalMaxDay } as React.CSSProperties : undefined}
                    title={cell.count > 0 ? `${cell.count} missing` : undefined}
                  >
                    {cell.day > 0 ? cell.day : ''}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDay && selectedEntries.length > 0 && (
        <div className="calendar__detail">
          <div className="calendar__detail-header">
            {new Date(selectedDay + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            — {selectedEntries.length} episode{selectedEntries.length !== 1 ? 's' : ''}
          </div>
          {selectedEntries.map((ep, i) => (
            <div key={i} className="calendar__detail-row">
              <span className="calendar__detail-show">{ep.seriesTitle}</span>
              <span className="calendar__detail-ep">
                S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
              </span>
              <span className="calendar__detail-title">{ep.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/*  Main component                                           */
/* ────────────────────────────────────────────────────────── */
export function MissingTimeline({ getMissingTimeline }: MissingTimelineProps) {
  const [rawEntries, setRawEntries] = useState<MissingTimelineEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TimelineView>('histogram');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMissingTimeline()
      .then(data => { if (!cancelled) { setRawEntries(data); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [getMissingTimeline]);

  const entries = useMemo(() => rawEntries ? filterEpochDates(rawEntries) : null, [rawEntries]);

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
    <div className="missing-timeline-root">
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
      {view === 'yearly' && <YearlyAreaChart entries={entries} />}
      {view === 'byYear' && <ByYearCards entries={entries} />}
      {view === 'shows' && <ShowTimeline entries={entries} />}
      {view === 'calendar' && <CalendarView entries={entries} />}
    </div>
  );
}
