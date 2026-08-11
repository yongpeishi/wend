import type { Entry, EntryCategory } from '../../api/types';

export type ScheduleState = 'all' | 'scheduled' | 'potential';

export interface IdeaFilters {
  category: EntryCategory | null;
  hasLocation: boolean;
  scheduleState: ScheduleState;
}

export const EMPTY_FILTERS: IdeaFilters = {
  category: null,
  hasLocation: false,
  scheduleState: 'all',
};

export function isNarrowed(filters: IdeaFilters): boolean {
  return filters.category !== null || filters.hasLocation || filters.scheduleState !== 'all';
}

/** Filters hide, never delete — this only changes what a query returns, nothing is archived. */
export function applyFilters(entries: Entry[], filters: IdeaFilters): Entry[] {
  return entries.filter((entry) => {
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.hasLocation && !(entry.lat !== null && entry.lng !== null)) return false;
    if (filters.scheduleState === 'scheduled' && !entry.scheduled) return false;
    if (filters.scheduleState === 'potential' && entry.scheduled) return false;
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

/**
 * One rendered section of the idea list. Every grouping function returns this
 * same shape so the list component never needs to know which mode produced it —
 * `key` is only ever a React key / DOM id seed, `label` is the visible heading.
 */
export interface EntryGroup {
  key: string;
  label: string;
  entries: Entry[];
}

/**
 * How the idea list is sectioned. Deliberately separate from `IdeaFilters`:
 * grouping and filtering are orthogonal, so the category chips keep narrowing
 * the list whichever mode is active. Grouping never hides an idea — it only
 * decides which heading it sits under.
 */
export type GroupMode = 'none' | 'category' | 'location';

/** Groups already-filtered entries by category, in a stable order, uncategorised last. */
export function groupByCategory(entries: Entry[]): EntryGroup[] {
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

/** The bucket every idea without a usable `location_name` falls into. */
export const NO_LOCATION_KEY = '__no_location__';
export const NO_LOCATION_LABEL = 'No location';

/**
 * Groups already-filtered entries by `location_name`, the mirror of
 * `groupByCategory` — same return shape, so both feed the same list renderer.
 *
 * `location_name` is nullable free text typed by a human, not a foreign key, so:
 *
 *   - Buckets are EXACT matches on the trimmed string. "Kyoto south" and
 *     "kyoto south" stay apart. Folding case (or fuzzy-matching near-misses)
 *     would silently merge two places a person deliberately wrote differently,
 *     and there is no way for them to pull the merge back apart. Wend never
 *     makes a destructive guess on the user's behalf.
 *   - Ordering is alphabetical and fully deterministic: `localeCompare` for
 *     human-sensible ordering, with a codepoint tiebreak so two strings that
 *     compare equal under base sensitivity ("Kyoto" vs "kyoto") still land in a
 *     fixed order rather than depending on input order.
 *   - Null, empty and whitespace-only names collect in one "No location"
 *     bucket, always last. It is a real, permanent, unremarkable state — an idea
 *     with no place yet is not a gap to nag about — so it gets a plain heading
 *     rather than being hidden or floated to the top.
 *
 * Empty buckets are never emitted, so the section list matches what is on
 * screen after filtering.
 */
export function groupByLocation(entries: Entry[]): EntryGroup[] {
  const named = new Map<string, Entry[]>();
  const unplaced: Entry[] = [];

  for (const entry of entries) {
    const name = entry.location_name?.trim();
    if (!name) {
      unplaced.push(entry);
      continue;
    }
    const bucket = named.get(name);
    if (bucket) bucket.push(entry);
    else named.set(name, [entry]);
  }

  const groups: EntryGroup[] = Array.from(named.entries())
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, list]) => ({ key, label: key, entries: list }));

  if (unplaced.length > 0) {
    groups.push({ key: NO_LOCATION_KEY, label: NO_LOCATION_LABEL, entries: unplaced });
  }

  return groups;
}

/** The single flat section 'none' renders as — one unlabelled group, everything in it. */
export const UNGROUPED_KEY = 'all';

/**
 * Dispatches to the right grouping for a mode. 'none' still returns a group
 * array (one unlabelled section) so callers that need the on-screen order —
 * e.g. resolving a shift-click range across the list — can always read it the
 * same way: `groupEntries(visible, mode).flatMap((g) => g.entries)`.
 */
export function groupEntries(entries: Entry[], mode: GroupMode): EntryGroup[] {
  switch (mode) {
    case 'category':
      return groupByCategory(entries);
    case 'location':
      return groupByLocation(entries);
    case 'none':
      return entries.length > 0 ? [{ key: UNGROUPED_KEY, label: '', entries }] : [];
  }
}
