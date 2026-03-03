import { useState } from 'react';
import { useAnimeMismatch } from '../hooks/useAnimeMismatch';
import { useSubtitleCheck } from '../hooks/useSubtitleCheck';
import { useSettings } from '../hooks/useSettings';
import { useIgnoredMismatches } from '../hooks/useIgnoredMismatches';
import { useIgnoredSubtitles } from '../hooks/useIgnoredSubtitles';
import { AnimeMismatch, SubtitleMissing } from '../types/anime';
import { AnimeMismatchCard } from '../components/AnimeMismatchCard/AnimeMismatchCard';
import { SubtitleMissingCard } from '../components/SubtitleMissingCard/SubtitleMissingCard';
import { SubtitleModal } from '../components/SubtitleModal/SubtitleModal';
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
  defaultOpen?: boolean;
}

function MismatchSection({
  title, description, items, ignoredItems, sonarrUrl, radarrUrl,
  loading, onRefresh, onIgnore, onRestore, defaultOpen = true,
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
}

function SubtitleSection({ items, ignoredItems, sonarrUrl, radarrUrl, plexConfigured, loading, error, onRefresh, onIgnore, onRestore, defaultOpen = true }: SubtitleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [sortBy, setSortBy] = useState<SubtitleSort>('missing');
  const [sortAsc, setSortAsc] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SubtitleMissing | null>(null);

  const sorted = [...items].sort((a, b) => {
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
          {!loading && <span className="anime-page__count">{items.length}</span>}
          {loading && <span className="anime-page__count anime-page__count--loading">…</span>}
          <span className="anime-page__chevron">{open ? '▾' : '▸'}</span>
        </div>
        {!loading && items.length > 1 && (
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
          ) : items.length === 0 ? (
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
        />
      )}
    </section>
  );
}

export function Anime() {
  const { items, loading, error, refresh } = useAnimeMismatch();
  const { items: subItems, loading: subLoading, error: subError, refresh: subRefresh } = useSubtitleCheck();
  const { settings } = useSettings();
  const { ignoredKeys, ignoreItem, restoreItem } = useIgnoredMismatches();
  const { ignoredKeys: ignoredSubKeys, ignoreItem: ignoreSubItem, restoreItem: restoreSubItem } = useIgnoredSubtitles();

  const sonarrUrl = settings?.sonarrUrl || '';
  const radarrUrl = settings?.radarrUrl || '';

  const notTagged = items.filter(i => i.mismatchType === 'anime-not-tagged');
  const allWronglyTagged = items.filter(i => i.mismatchType === 'tagged-not-anime');
  const visibleWronglyTagged = allWronglyTagged.filter(i => !ignoredKeys.has(`${i.service}-${i.id}`));
  const ignoredWronglyTagged = allWronglyTagged.filter(i => ignoredKeys.has(`${i.service}-${i.id}`));

  const visibleSubItems = subItems.filter(i => !ignoredSubKeys.has(`${i.service}-${i.id}`));
  const ignoredSubItems = subItems.filter(i => ignoredSubKeys.has(`${i.service}-${i.id}`));

  if (loading) return <div className="page"><div className="loading">Checking anime tags...</div></div>;

  return (
    <div className="page">
      {error && <div className="error-banner">{error}</div>}
      <h2 className="anime-page__heading">Anime Check</h2>

      {notTagged.length > 0 && (
        <MismatchSection
          title={'Anime missing the "anime" tag'}
          description={"These have missing episodes/files and are set as anime in Sonarr (series type = anime) or detected as Japanese animation in Radarr, but don't have the \"anime\" tag applied."}
          items={notTagged}
          sonarrUrl={sonarrUrl}
          radarrUrl={radarrUrl}
          loading={loading}
          onRefresh={refresh}
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
      />

      {notTagged.length === 0 && visibleWronglyTagged.length === 0 && visibleSubItems.length === 0 && !loading && !subLoading && (
        <div className="empty-state">
          <h2>All Good</h2>
          <p>No anime tag mismatches or missing English subtitles found.</p>
        </div>
      )}
    </div>
  );
}
