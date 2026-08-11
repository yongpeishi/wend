import { describe, expect, it } from 'vitest';
import { EMPTY_LIBRARY_FILTERS, applyLibraryFilters, isLibraryFiltersNarrowed } from './libraryFilters';
import type { Entry } from '../../api/types';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'idea',
    title: 'Untitled',
    description: null,
    category: null,
    starts_on: null,
    ends_on: null,
    location_name: null,
    address: null,
    lat: null,
    lng: null,
    duration_minutes: null,
    source_url: null,
    notes: null,
    from_entry_id: null,
    to_entry_id: null,
    pros: [],
    cons: [],
    archived_at: null,
    created_at: '',
    updated_at: '',
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
    ...overrides,
  };
}

describe('isLibraryFiltersNarrowed', () => {
  it('is false for the empty filter set', () => {
    expect(isLibraryFiltersNarrowed(EMPTY_LIBRARY_FILTERS)).toBe(false);
  });

  it('is true once a category or search term is set', () => {
    expect(isLibraryFiltersNarrowed({ category: 'food', search: '' })).toBe(true);
    expect(isLibraryFiltersNarrowed({ category: null, search: 'onsen' })).toBe(true);
  });
});

describe('applyLibraryFilters', () => {
  const entries = [
    makeEntry({ id: 1, title: 'Fushimi Inari at dawn', category: 'place' }),
    makeEntry({ id: 2, title: 'Onsen day trip', category: 'activity' }),
    makeEntry({ id: 3, title: 'Ramen alley', category: 'food' }),
  ];

  it('hides, never removes — the input array is untouched', () => {
    applyLibraryFilters(entries, { category: 'food', search: '' });
    expect(entries).toHaveLength(3);
  });

  it('filters by category', () => {
    expect(applyLibraryFilters(entries, { category: 'activity', search: '' }).map((e) => e.id)).toEqual([2]);
  });

  it('filters by a case-insensitive title search', () => {
    expect(applyLibraryFilters(entries, { category: null, search: 'ONSEN' }).map((e) => e.id)).toEqual([2]);
  });

  it('returns everything when nothing is narrowed', () => {
    expect(applyLibraryFilters(entries, EMPTY_LIBRARY_FILTERS)).toHaveLength(3);
  });
});
