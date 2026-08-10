import type { Entry, EntryCategory } from '../../api/types';

export type MapScheduleFilter = 'all' | 'scheduled' | 'potential';

export interface MapFilters {
  category: EntryCategory | null;
  scheduleState: MapScheduleFilter;
}

export const EMPTY_MAP_FILTERS: MapFilters = { category: null, scheduleState: 'all' };

export function isMapFiltersNarrowed(filters: MapFilters): boolean {
  return filters.category !== null || filters.scheduleState !== 'all';
}

/** Filters hide pins, never delete entries — same rule as the board's filter bar. */
export function applyMapFilters(entries: Entry[], filters: MapFilters): Entry[] {
  return entries.filter((entry) => {
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.scheduleState === 'scheduled' && !entry.scheduled) return false;
    if (filters.scheduleState === 'potential' && entry.scheduled) return false;
    return true;
  });
}
