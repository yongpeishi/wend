import type { Entry, EntryCategory } from '../../api/types';

export type ScheduleState = 'all' | 'scheduled' | 'potential';

export interface IdeaFilters {
  /**
   * The categories the list is narrowed to, as a set the user builds up rather
   * than a single choice they replace.
   *
   * This was one nullable category, which quietly imposed a question nobody
   * asked: "food OR places?" is the normal shape of a trip question — you are
   * deciding where to eat and what to see in the same sitting — and a
   * single-value filter made answering it a matter of flipping between two
   * lists and holding the other one in your head. Selecting a second category
   * used to silently throw the first away, which is the one thing a filter
   * must never do quietly.
   *
   * So: a union, not an intersection. Ideas are tagged with exactly one
   * category, so intersecting two categories would always yield nothing —
   * "food AND lodging" is not a question this data can answer. Union is the
   * only reading that means anything here, and it is also the one the chips
   * look like they promise: each lit chip adds its ideas to the list.
   *
   * An EMPTY array means no category narrowing at all — every idea passes,
   * including uncategorised ones. It deliberately does not mean "show nothing":
   * emptiness is the resting state you land in on first load and return to via
   * "See all", and a filter that hid everything when nothing was chosen would
   * be a screen that starts blank.
   */
  categories: EntryCategory[];
  hasLocation: boolean;
  scheduleState: ScheduleState;
  /**
   * Free-text narrowing on the title — a case-insensitive substring, nothing
   * cleverer. It is a filter like the chips, not a mode of its own: it stacks
   * with the categories and the schedule state, and clearing it is deleting
   * what you typed. Whitespace-only text narrows nothing, so a stray space in
   * the box cannot quietly empty the board.
   */
  text: string;
}

export const EMPTY_FILTERS: IdeaFilters = {
  categories: [],
  hasLocation: false,
  scheduleState: 'all',
  text: '',
};

export function isNarrowed(filters: IdeaFilters): boolean {
  return (
    filters.categories.length > 0 ||
    filters.hasLocation ||
    filters.scheduleState !== 'all' ||
    filters.text.trim() !== ''
  );
}

/** Filters hide, never delete — this only changes what a query returns, nothing is archived. */
export function applyFilters(entries: Entry[], filters: IdeaFilters): Entry[] {
  const query = filters.text.trim().toLowerCase();
  return entries.filter((entry) => {
    if (query !== '' && !entry.title.toLowerCase().includes(query)) return false;
    // No categories chosen is the widest state, not the narrowest: the whole
    // list passes. Once any chip is lit, an idea has to be in one of them —
    // and an uncategorised idea is in none, so it steps aside until the
    // narrowing is lifted.
    if (filters.categories.length > 0 && !(entry.category !== null && filters.categories.includes(entry.category)))
      return false;
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
 * Adds or removes one category from a multi-select filter, keeping the result
 * in CATEGORY_ORDER.
 *
 * The order is canonical rather than click-ordered on purpose: the same set of
 * lit chips always produces the same array, whichever sequence the user
 * clicked them in. That makes the filter state comparable — two people who
 * picked Food and Place in opposite orders hold equal state — so memoised
 * derivations downstream do not re-run over a difference that is not one, and
 * tests can assert on the array without encoding the path taken to it.
 *
 * Lives here rather than in the bar that draws the chips because all three
 * filter surfaces (board, map, library) toggle the same categories the same
 * way, and one copy of "what a chip click means" is enough. The array is
 * rebuilt rather than mutated, so callers can hand the result straight to
 * `setFilters` and get the new reference React needs.
 */
export function toggleCategory(categories: EntryCategory[], category: EntryCategory): EntryCategory[] {
  const next = new Set(categories);
  if (!next.delete(category)) next.add(category);
  return CATEGORY_ORDER.filter((known) => next.has(known));
}

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
export type GroupMode = 'none' | 'category';

/**
 * The two groupings the board's control offers, flat first. There is only one
 * way to section the list now, so what used to be a choice among several is a
 * toggle: on, and the ideas sit under category headings; off, and they are one
 * run. Both states are always on screen, so grouping cannot strand you —
 * getting back to a flat list is the same single click as the move that got you
 * there.
 *
 * Worth saying plainly, because it is no longer obvious from the code: the
 * grouping control and the category chips now read the same field. They still
 * do different jobs — the chips decide which ideas are on the board at all, the
 * mode decides what headings they sit under — but that means lighting Food and
 * grouping by category leaves a single section titled Food, which is the two
 * controls composing rather than either one misbehaving.
 */
export const GROUP_MODES: { key: GroupMode; label: string }[] = [
  { key: 'none', label: 'Ungrouped' },
  { key: 'category', label: 'By category' },
];

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
    case 'none':
      return entries.length > 0 ? [{ key: UNGROUPED_KEY, label: '', entries }] : [];
  }
}
