import type { Entry, EntryCategory } from '../../api/types';

/**
 * What the library's chip row and search box narrow by.
 *
 * `categories` is a list for the same reason as the map's (see
 * features/map/mapFilters.ts), and the library is where it bites hardest: this
 * screen is a pile of everything ever kept, browsed rather than searched, and
 * "show me food and places" is a normal way to sift a pile. With one category
 * at a time each chip click threw the last one away, so that request had no
 * expression at all — you either narrowed to one kind or read the whole pile.
 *
 * The list is the set of categories to keep, so an EMPTY list means "no
 * category narrowing", never "match nothing" — see EMPTY_LIBRARY_FILTERS.
 *
 * `search` stays a single string and keeps AND-ing with the categories: the two
 * controls answer different questions ("what kind of thing" and "what is it
 * called"), so narrowing by both means both, exactly as before.
 */
export interface LibraryFilters {
  categories: EntryCategory[];
  search: string;
}

/**
 * The unnarrowed library: everything kept, on screen.
 *
 * Empty `categories` is the widest state, not the narrowest — deselecting your
 * last chip returns you to the full library rather than emptying the screen.
 */
export const EMPTY_LIBRARY_FILTERS: LibraryFilters = { categories: [], search: '' };

export function isLibraryFiltersNarrowed(filters: LibraryFilters): boolean {
  return filters.categories.length > 0 || filters.search.trim() !== '';
}

/**
 * Adds or removes one category, leaving the rest of the selection alone.
 *
 * Order is click order (append on select), same as the map's — deterministic,
 * never reordered under the user, and read by nothing downstream: matching asks
 * only about membership and the chips are drawn in CATEGORY_ORDER.
 */
export function toggleLibraryCategory(filters: LibraryFilters, category: EntryCategory): LibraryFilters {
  return {
    ...filters,
    categories: filters.categories.includes(category)
      ? filters.categories.filter((selected) => selected !== category)
      : [...filters.categories, category],
  };
}

/** Filters hide, never delete — same rule as the board's and map's filter bars. */
export function applyLibraryFilters(entries: Entry[], filters: LibraryFilters): Entry[] {
  const search = filters.search.trim().toLowerCase();
  return entries.filter((entry) => {
    // Categories are OR'd with each other (an entry has only one, so anything
    // else returns nothing) and AND'd with the search term, which is asking a
    // different question entirely.
    const matchesCategory =
      filters.categories.length === 0 ||
      (entry.category !== null && filters.categories.includes(entry.category));
    if (!matchesCategory) return false;
    if (search && !entry.title.toLowerCase().includes(search)) return false;
    return true;
  });
}
