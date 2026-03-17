import { StalenessLevel, StalenessThresholds, DEFAULT_THRESHOLDS } from '../types/common';

export function getStaleness(dateAdded: string, thresholds?: StalenessThresholds, releaseDate?: string): StalenessLevel {
  const t = thresholds || DEFAULT_THRESHOLDS;
  // Use the later of dateAdded vs releaseDate (e.g. latest missing episode air date)
  const addedTime = dateAdded ? new Date(dateAdded).getTime() : 0;
  const releaseTime = releaseDate ? new Date(releaseDate).getTime() : 0;
  let referenceDate = Math.max(addedTime || 0, releaseTime || 0);
  if (!referenceDate) referenceDate = Date.now(); // no dates at all → treat as fresh
  const days = Math.floor(
    (Date.now() - referenceDate) / (1000 * 60 * 60 * 24)
  );
  if (days < t.staleDays) return StalenessLevel.Fresh;
  if (days < t.veryStaledays) return StalenessLevel.Stale;
  if (days < t.ancientDays) return StalenessLevel.VeryStale;
  return StalenessLevel.Ancient;
}

export function getStalenessLabel(level: StalenessLevel): string {
  switch (level) {
    case StalenessLevel.Fresh: return 'Fresh';
    case StalenessLevel.Stale: return 'Stale';
    case StalenessLevel.VeryStale: return 'Very Stale';
    case StalenessLevel.Ancient: return 'Ancient';
  }
}

export function getStalenessColor(level: StalenessLevel): string {
  switch (level) {
    case StalenessLevel.Fresh: return '#27ae60';
    case StalenessLevel.Stale: return '#f39c12';
    case StalenessLevel.VeryStale: return '#e67e22';
    case StalenessLevel.Ancient: return '#e74c3c';
  }
}
