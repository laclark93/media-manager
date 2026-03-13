import { useState } from 'react';
import { useAnimeMismatch } from '../hooks/useAnimeMismatch';
import { useSubtitleCheck } from '../hooks/useSubtitleCheck';
import { useSettings } from '../hooks/useSettings';
import { useIgnoredMismatches } from '../hooks/useIgnoredMismatches';
import { useIgnoredSubtitles } from '../hooks/useIgnoredSubtitles';
import { AnimeMismatch, SubtitleMissing } from '../types/anime';
import { fetchApi } from '../utils/api';
import { AnimeMismatchCard } from '../components/AnimeMismatchCard/AnimeMismatchCard';
import { SubtitleMissingCard } from '../components/SubtitleMissingCard/SubtitleMissingCard';
import { SubtitleModal } from '../components/SubtitleModal/SubtitleModal';
import { LastUpdated } from '../components/LastUpdated/LastUpdated';
import './Anime.css';

interface MismatchSectionProps {
  title: string;
  description: string;
  items: AnimeMismatch[];
  ignoredItems?: AnimeMismatch[];
  sonarrUrl: string;
  radarrUrl: string;
  loading: boolean;
  onRefresh: () => void;
  onIgnore?: (key: string) => void;
  onRestore?: (key: string) => void;
  onAddTag?: (item: AnimeMismatch) => Promise<void>;
  defaultOpen?: boolean;
  lastUpdated?: number | null;
}

function MismatchSection({
  title, description, items, ignoredItems, sonarrUrl, radarrUrl,
  loading, onRefresh, onIgnore, onRestore, onAddTag, defaultOpen = true, lastUpdated,
}: MismatchSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [showIgnored, setShowIgnored] = useState(false);

  return (
    <section className="anime-page__section">
      <div className="anime-page__section-header">
        <div className="anime-page__section-toggle" onClick={() => setOpen(o => !o)}>
          <span className="anime-page__section-title">{title}</span>
          <span className="anime-page__count">{items.length}</span>
          <span className="anime-page__chevron">{open ? '▾' : '▸'}</span>
        </div>
        <LastUpdated timestamp={lastUpdated ?? null} />
        <button
          className="anime-page__section-refresh"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
        >
          {loading ? '…' : '↺'}
        </button>
      </div>
      {open && (
        <>
          <p className="anime-page__section-desc">{description}</p>
          <div className="media-grid">
            {items.map(item => {
              const key = `${item.service}-${item.id}`;
              return (
                <AnimeMismatchCard
                  key={key}
                  item={item}
                  sonarrUrl={sonarrUrl}
                  radarrUrl={radarrUrl}
                  onIgnore={onIgnore ? () => onIgnore(key) : undefined}
                  onAddTag={onAddTag ? () => onAddTag(item) : undefined}
                />
              );
            })}
          </div>
          {ignoredItems && ignoredItems.length > 0 && onRestore && (
            <div className="amcard__ignored-section">
              <button
                className="amcard__ignored-toggle"
                onClick={() => setShowIgnored(o => !o)}
              >
                {showIgnored ? '▾' : '▸'} Ignored ({ignoredItems.length})
              </button>
              {showIgnored && (
                <div className="amcard__ignored-list">
                  {ignoredItems.map(item => {
                    const key = `${item.service}-${item.id}`;
                    return (
                      <span key={key} className="amcard__ignored-chip">
                        {item.title}
                        <button
                          className="amcard__ignored-restore"
                          onClick={() => onRestore(key)}
                          title="Restore — show again"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

type SubtitleSort = 'missing' | 'title' | 'year';

interface SubtitleSectionProps {
  items: SubtitleMissing[];
  ignoredItems?: SubtitleMissing[];
  sonarrUrl: string;
  radarrUrl: string;
  plexConfigured?: boolean;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onIgnore?: (key: string) => void;
  onRestore?: (key: string) => void;
  defaultOpen?: boolean;
  lastUpdated?: number | null;
}

function SubtitleSection({ items, ignoredItems, sonarrUrl, radarrUrl, plexConfigured, loading, error, onRefresh, onIgnore, onRestore, defaultOpen = true, lastUpdated }: SubtitleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [sortBy, _setSortBy] = useState<SubtitleSort>(() => {
    const saved = localStorage.getItem('subtitles.sortBy');
    if (saved && ['missing', 'title', 'year'].includes(saved)) return saved as SubtitleSort;
    return 'missing';
  });
  const [sortAsc, _setSortAsc] = useState(() => {
    const saved = localStorage.getItem('subtitles.sortAsc');
    return saved === 'true';
  });
  const setSortBy = (v: SubtitleSort) => { _setSortBy(v); localStorage.setItem('subtitles.sortBy', v); };
  const setSortAsc = (v: boolean | ((prev: boolean) => boolean)) => {
    _setSortAsc(prev => { const next = typeof v === 'function' ? v(prev) : v; localStorage.setItem('subtitles.sortAsc', String(next)); return next; });
  };
  const [showIgnored, setShowIgnored] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SubtitleMissing | null>(null);
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());

  const visibleItems = items.filter(i => !completedKeys.has(`${i.service}-${i.id}`));

  const sorted = [...visibleItems].sort((a, b) => {
    let cmp: number;
    if (sortBy === 'missing') cmp = b.affectedFiles - a.affectedFiles;
    else if (sortBy === 'year') cmp = (b.year ?? 0) - (a.year ?? 0);
    else cmp = a.title.localeCompare(b.title);
    return sortAsc ? -cmp : cmp;
  });

  return (
    <section className="anime-page__section">
      <div className="anime-page__section-header">
        <div className="anime-page__section-toggle" onClick={() => setOpen(o => !o)}>
          <span className="anime-page__section-title">Anime missing English subtitles</span>
          {!loading && <span className="anime-page__count">{visibleItems.length}</span>}
          {loading && <span className="anime-page__count anime-page__count--loading">…</span>}
          <span className="anime-page__chevron">{open ? '▾' : '▸'}</span>
        </div>
        {!loading && visibleItems.length > 1 && (
          <div className="anime-page__sort-bar">
            {(['missing', 'title', 'year'] as SubtitleSort[]).map(opt => (
              <button
                key={opt}
                className={`anime-page__sort-btn${sortBy === opt ? ' anime-page__sort-btn--active' : ''}`}
                onClick={() => setSortBy(opt)}
              >
                {opt === 'missing' ? '# Missing' : opt === 'title' ? 'Title' : 'Year'}
              </button>
            ))}
            <button
              className="anime-page__sort-dir"
              onClick={() => setSortAsc(v => !v)}
              title={sortAsc ? 'Ascending' : 'Descending'}
            >
              {sortAsc ? '↑' : '↓'}
            </button>
          </div>
        )}
        <LastUpdated timestamp={lastUpdated ?? null} />
        <button
          className="anime-page__section-refresh"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
        >
          {loading ? '…' : '↺'}
        </button>
      </div>
      {open && (
        <>
          <p className="anime-page__section-desc">
            Downloaded anime files where subtitle tracks are explicitly listed but English is not among them.
            Files with no subtitle track info are assumed to have English subtitles.
          </p>
          {error && <div className="error-banner" style={{ margin: '0 0 12px' }}>{error}</div>}
          {loading ? (
            <div className="loading">Scanning subtitle tracks...</div>
          ) : visibleItems.length === 0 ? (
            <p className="anime-page__section-desc" style={{ color: 'var(--success)' }}>
              No issues found — all downloaded anime have English subtitles (or unnamed tracks).
            </p>
          ) : (
            <div className="media-grid">
              {sorted.map(item => {
                const key = `${item.service}-${item.id}`;
                return (
                  <SubtitleMissingCard
                    key={key}
                    item={item}
                    sonarrUrl={sonarrUrl}
                    radarrUrl={radarrUrl}
                    onIgnore={onIgnore ? () => onIgnore(key) : undefined}
                    onCardClick={() => setSelectedItem(item)}
                  />
                );
              })}
            </div>
          )}
          {ignoredItems && ignoredItems.length > 0 && onRestore && (
            <div className="amcard__ignored-section">
              <button
                className="amcard__ignored-toggle"
                onClick={() => setShowIgnored(o => !o)}
              >
                {showIgnored ? '▾' : '▸'} Ignored ({ignoredItems.length})
              </button>
              {showIgnored && (
                <div className="amcard__ignored-list">
                  {ignoredItems.map(item => {
                    const key = `${item.service}-${item.id}`;
                    return (
                      <span key={key} className="amcard__ignored-chip">
                        {item.title}
                        <button
                          className="amcard__ignored-restore"
                          onClick={() => onRestore(key)}
                          title="Restore — show again"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {selectedItem && (
        <SubtitleModal
          item={selectedItem}
          sonarrUrl={sonarrUrl}
          radarrUrl={radarrUrl}
          plexConfigured={plexConfigured}
          onClose={() => setSelectedItem(null)}
          onAllMarkedFailed={() => setCompletedKeys(prev => new Set([...prev, `${selectedItem.service}-${selectedItem.id}`]))}
        />
      )}
    </section>
  );
}

export function Anime() {
  const { items, loading, error, refresh, lastUpdated: mismatchLastUpdated } = useAnimeMismatch();
  const { items: subItems, loading: subLoading, error: subError, refresh: subRefresh, lastUpdated: subLastUpdated } = useSubtitleCheck();
  const { settings } = useSettings();
  const { ignoredKeys, ignoreItem, restoreItem } = useIgnoredMismatches();
  const { ignoredKeys: ignoredSubKeys, ignoreItem: ignoreSubItem, restoreItem: restoreSubItem } = useIgnoredSubtitles();

  const handleAddTag = async (item: AnimeMismatch) => {
    const endpoint = item.service === 'sonarr'
      ? `/api/sonarr/add-anime-tag/${item.id}`
      : `/api/radarr/add-anime-tag/${item.id}`;
    await fetchApi(endpoint, {
      method: 'POST',
      body: JSON.stringify({ instanceUrl: item.instanceUrl }),
    });
  };

  const visibleSubItems = subItems.filter(i => !ignoredSubKeys.has(`${i.service}-${i.id}`));
  const ignoredSubItems = subItems.filter(i => ignoredSubKeys.has(`${i.service}-${i.id}`));

  // Build set of series/movie IDs that have subtitle issues
  const subItemKeys = new Set(subItems.map(i => `${i.service}-${i.id}`));

  // "anime-not-tagged": show if has missing episodes/files OR has subtitle issues
  const allNotTagged = items.filter(i => i.mismatchType === 'anime-not-tagged' && (i.hasMissing || subItemKeys.has(`${i.service}-${i.id}`)));
  const visibleNotTagged = allNotTagged.filter(i => !ignoredKeys.has(`${i.service}-${i.id}-tag`));
  const ignoredNotTagged = allNotTagged.filter(i => ignoredKeys.has(`${i.service}-${i.id}-tag`));
  // "tagged-not-anime": only show if has missing episodes/files
  const allWronglyTagged = items.filter(i => i.mismatchType === 'tagged-not-anime' && i.hasMissing);
  const visibleWronglyTagged = allWronglyTagged.filter(i => !ignoredKeys.has(`${i.service}-${i.id}`));
  const ignoredWronglyTagged = allWronglyTagged.filter(i => ignoredKeys.has(`${i.service}-${i.id}`));
  // "wrong-directory": anime not in anime root folder
  const allWrongDir = items.filter(i => i.mismatchType === 'wrong-directory');
  const visibleWrongDir = allWrongDir.filter(i => !ignoredKeys.has(`${i.service}-${i.id}-dir`));
  const ignoredWrongDir = allWrongDir.filter(i => ignoredKeys.has(`${i.service}-${i.id}-dir`));

  const sonarrUrl = settings?.sonarrUrl || '';
  const radarrUrl = settings?.radarrUrl || '';

  if (loading) return <div className="page"><div className="loading">Checking anime tags...</div></div>;

  return (
    <div className="page">
      {error && <div className="error-banner">{error}</div>}
      <h2 className="anime-page__heading">Anime Check</h2>

      {(visibleNotTagged.length > 0 || ignoredNotTagged.length > 0) && (
        <MismatchSection
          title={'Anime missing the "anime" tag'}
          description={"These have missing episodes/files and are set as anime in Sonarr (series type = anime) or detected as Japanese animation in Radarr, but don't have the \"anime\" tag applied."}
          items={visibleNotTagged}
          ignoredItems={ignoredNotTagged}
          sonarrUrl={sonarrUrl}
          radarrUrl={radarrUrl}
          loading={loading}
          onRefresh={refresh}
          onIgnore={(key) => ignoreItem(key + '-tag')}
          onRestore={(key) => restoreItem(key + '-tag')}
          onAddTag={handleAddTag}
          lastUpdated={mismatchLastUpdated}
        />
      )}
      {(visibleWronglyTagged.length > 0 || ignoredWronglyTagged.length > 0) && (
        <MismatchSection
          title={'Tagged "anime" but not anime'}
          description={"These have missing episodes/files and have the \"anime\" tag, but Sonarr's series type is not anime or they are not Japanese animation in Radarr."}
          items={visibleWronglyTagged}
          ignoredItems={ignoredWronglyTagged}
          sonarrUrl={sonarrUrl}
          radarrUrl={radarrUrl}
          loading={loading}
          onRefresh={refresh}
          onIgnore={ignoreItem}
          onRestore={restoreItem}
          lastUpdated={mismatchLastUpdated}
        />
      )}

      {(visibleWrongDir.length > 0 || ignoredWrongDir.length > 0) && (
        <MismatchSection
          title="Anime in wrong directory"
          description="These are marked as anime (by tag or series type) but are stored outside the anime root folder."
          items={visibleWrongDir}
          ignoredItems={ignoredWrongDir}
          sonarrUrl={sonarrUrl}
          radarrUrl={radarrUrl}
          loading={loading}
          onRefresh={refresh}
          onIgnore={(key) => ignoreItem(key + '-dir')}
          onRestore={(key) => restoreItem(key + '-dir')}
          lastUpdated={mismatchLastUpdated}
        />
      )}

      <SubtitleSection
        items={visibleSubItems}
        ignoredItems={ignoredSubItems}
        sonarrUrl={sonarrUrl}
        radarrUrl={radarrUrl}
        plexConfigured={settings?.plexConfigured}
        loading={subLoading}
        error={subError}
        onRefresh={subRefresh}
        onIgnore={ignoreSubItem}
        onRestore={restoreSubItem}
        lastUpdated={subLastUpdated}
      />

      {visibleNotTagged.length === 0 && visibleWronglyTagged.length === 0 && visibleWrongDir.length === 0 && visibleSubItems.length === 0 && !loading && !subLoading && (
        <div className="empty-state">
          <h2>All Good</h2>
          <p>No anime tag mismatches or missing English subtitles found.</p>
        </div>
      )}
    </div>
  );
}
