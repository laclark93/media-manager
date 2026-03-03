export enum StalenessLevel {
  Fresh = 'fresh',
  Stale = 'stale',
  VeryStale = 'very-stale',
  Ancient = 'ancient',
}

export type SortOption = 'title' | 'dateAdded' | 'lastAired' | 'percentMissing' | 'numberMissing';

export interface StalenessThresholds {
  staleDays: number;
  veryStaledays: number;
  ancientDays: number;
}

export const DEFAULT_THRESHOLDS: StalenessThresholds = {
  staleDays: 7,
  veryStaledays: 28,
  ancientDays: 90,
};
