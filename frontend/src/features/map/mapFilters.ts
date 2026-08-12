import { toggleCategory } from '../board/filters';
import type { Entry, EntryCategory } from '../../api/types';

export type MapScheduleFilter = 'all' | 'scheduled' | 'potential';

/**
 * What the map's chip row narrows by.
 *
 * `categories` is a list rather than one value because the question a map
 * actually invites is a union: "where could we eat or sleep around here" is
 * two kinds at once, and it is one question, not two. A one-at-a-time chip row
 * cannot answer it — each click silently discards the previous answer, so the
 * only way to see food and lodging together is to give up on narrowing at all
 * and read the whole map. Widening the field to a list makes the union
 * expressible without adding a second control to learn: the chips look and
 * behave the same, they just stop cancelling each other.
 *
 * The list is the set of categories to keep, so an EMPTY list means "no
 * category narrowing", never "match nothing" — see EMPTY_MAP_FILTERS.
 *
 * `scheduleState` stays a single value on purpose. Its options are mutually
 * exclusive states of one idea ("already on a day" vs "still just a maybe"),
 * so a union of both is exactly "all", which the enum already spells. Categories
 * are independent labels, which is why only they became a list.
 */
export interface MapFilters {
  categories: EntryCategory[];
  scheduleState: MapScheduleFilter;
}

/**
 * The unnarrowed map: every located pin on screen.
 *
 * Empty `categories` is the widest state, not the narrowest. Reading it as "an
 * empty allow-list, therefore show nothing" would make the map go blank the
 * moment you deselected your last chip — a filter that punishes you for
 * undoing it. The one rule in applyMapFilters keeps the two readings from ever
 * diverging.
 */
export const EMPTY_MAP_FILTERS: MapFilters = { categories: [], scheduleState: 'all' };

export function isMapFiltersNarrowed(filters: MapFilters): boolean {
  return filters.categories.length > 0 || filters.scheduleState !== 'all';
}

/**
 * Adds or removes one category, leaving the rest of the selection alone — the
 * whole difference between a multi-select chip row and the single-value one it
 * replaced.
 *
 * The array work is the board's `toggleCategory` rather than a copy of it: the
 * three chip rows are meant to be one behaviour, and a second implementation is
 * just somewhere for them to drift apart. That also inherits its ordering rule —
 * the result is in canonical CATEGORY_ORDER, the order the chips are drawn in,
 * so the same SET of lit chips always produces the same array however it was
 * arrived at. Equal selections compare equal, memoised derivations don't re-run
 * on a difference that isn't one, and tests can assert on the array without
 * encoding a click sequence. Nothing on screen moves either way: matching asks
 * only about membership.
 */
export function toggleMapCategory(filters: MapFilters, category: EntryCategory): MapFilters {
  return { ...filters, categories: toggleCategory(filters.categories, category) };
}

/** Filters hide pins, never delete entries — same rule as the board's filter bar. */
export function applyMapFilters(entries: Entry[], filters: MapFilters): Entry[] {
  return entries.filter((entry) => {
    // Selected categories are OR'd, not AND'd: an entry carries exactly one
    // category, so intersecting them could only ever return nothing. Union is
    // the only reading of several lit chips that means anything here.
    const matchesCategory =
      filters.categories.length === 0 ||
      (entry.category !== null && filters.categories.includes(entry.category));
    if (!matchesCategory) return false;
    if (filters.scheduleState === 'scheduled' && !entry.scheduled) return false;
    if (filters.scheduleState === 'potential' && entry.scheduled) return false;
    return true;
  });
}
