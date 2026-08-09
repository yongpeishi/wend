import type { Entry, EntryCategory } from '../../api/types';

export interface LibraryFilters {
  category: EntryCategory | null;
  search: string;
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = { category: null, search: '' };

export function isLibraryFiltersNarrowed(filters: LibraryFilters): boolean {
  return filters.category !== null || filters.search.trim() !== '';
}

/** Filters hide, never delete — same rule as the board's and map's filter bars. */
export function applyLibraryFilters(entries: Entry[], filters: LibraryFilters): Entry[] {
  const search = filters.search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.category && entry.category !== filters.category) return false;
    if (search && !entry.title.toLowerCase().includes(search)) return false;
    return true;
  });
}
