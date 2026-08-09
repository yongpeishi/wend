import type { Entry, EntryCategory } from '../../api/types';

export type ScheduleState = 'all' | 'scheduled' | 'potential';

export interface IdeaFilters {
  category: EntryCategory | null;
  hasLocation: boolean;
  scheduleState: ScheduleState;
  search: string;
}

export const EMPTY_FILTERS: IdeaFilters = {
  category: null,
  hasLocation: false,
  scheduleState: 'all',
  search: '',
};

export function isNarrowed(filters: IdeaFilters): boolean {
  return (
    filters.category !== null ||
    filters.hasLocation ||
    filters.scheduleState !== 'all' ||
    filters.search.trim() !== ''
  );
}

/** Filters hide, never delete — this only changes what a query returns, nothing is archived. */
export function applyFilters(entries: Entry[], filters: IdeaFilters): Entry[] {
  const search = filters.search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.hasLocation && !(entry.lat !== null && entry.lng !== null)) return false;
    if (filters.scheduleState === 'scheduled' && !entry.scheduled) return false;
    if (filters.scheduleState === 'potential' && entry.scheduled) return false;
    if (search && !entry.title.toLowerCase().includes(search)) return false;
    return true;
  });
}

export const CATEGORY_ORDER: EntryCategory[] = ['place', 'food', 'activity', 'lodging', 'transport', 'other'];

export const CATEGORY_LABELS: Record<EntryCategory, string> = {
  place: 'Place',
  food: 'Food',
  activity: 'Activity',
  lodging: 'Lodging',
  transport: 'Transport',
  other: 'Other',
};

/** Groups already-filtered entries by category, in a stable order, uncategorised last. */
export function groupByCategory(entries: Entry[]): Array<{ key: string; label: string; entries: Entry[] }> {
  const groups = new Map<string, Entry[]>();
  for (const category of CATEGORY_ORDER) groups.set(category, []);
  groups.set('uncategorised', []);
  for (const entry of entries) {
    const key = entry.category ?? 'uncategorised';
    const bucket = groups.get(key) ?? [];
    bucket.push(entry);
    groups.set(key, bucket);
  }
  return Array.from(groups.entries())
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({
      key,
      label: key === 'uncategorised' ? 'Uncategorised' : CATEGORY_LABELS[key as EntryCategory],
      entries: list,
    }));
}
