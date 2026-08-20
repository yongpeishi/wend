import { describe, expect, it } from 'vitest';
import {
  EMPTY_LIBRARY_FILTERS,
  applyLibraryFilters,
  isLibraryFiltersNarrowed,
  toggleLibraryCategory,
} from './libraryFilters';
import type { LibraryFilters } from './libraryFilters';
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
    parent_ids: [],
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
    expect(isLibraryFiltersNarrowed({ categories: ['food'], search: '' })).toBe(true);
    expect(isLibraryFiltersNarrowed({ categories: [], search: 'onsen' })).toBe(true);
  });

  it('is still true with several categories lit, and false again once the last goes out', () => {
    expect(isLibraryFiltersNarrowed({ categories: ['food', 'place'], search: '' })).toBe(true);
    expect(isLibraryFiltersNarrowed({ categories: [], search: '' })).toBe(false);
  });
});

describe('toggleLibraryCategory', () => {
  it('adds on select and removes on re-select, leaving the rest of the selection alone', () => {
    const one = toggleLibraryCategory(EMPTY_LIBRARY_FILTERS, 'food');
    expect(one.categories).toEqual(['food']);

    // Canonical CATEGORY_ORDER, not click order: 'place' precedes 'food' there,
    // so clicking food then place still yields place-first.
    const two = toggleLibraryCategory(one, 'place');
    expect(two.categories).toEqual(['place', 'food']);

    const back = toggleLibraryCategory(two, 'food');
    expect(back.categories).toEqual(['place']); // the other chip stays lit
  });

  it('gives the same array for the same set of chips, whichever order they were clicked', () => {
    const foodThenPlace = toggleLibraryCategory(toggleLibraryCategory(EMPTY_LIBRARY_FILTERS, 'food'), 'place');
    const placeThenFood = toggleLibraryCategory(toggleLibraryCategory(EMPTY_LIBRARY_FILTERS, 'place'), 'food');
    expect(foodThenPlace.categories).toEqual(placeThenFood.categories);
  });

  it('leaves the search term untouched and never mutates the input', () => {
    const before: LibraryFilters = { categories: ['food'], search: 'onsen' };
    const after = toggleLibraryCategory(before, 'place');
    expect(after.search).toBe('onsen');
    expect(before.categories).toEqual(['food']);
  });
});

describe('applyLibraryFilters', () => {
  const entries = [
    makeEntry({ id: 1, title: 'Fushimi Inari at dawn', category: 'place' }),
    makeEntry({ id: 2, title: 'Onsen day trip', category: 'activity' }),
    makeEntry({ id: 3, title: 'Ramen alley', category: 'food' }),
    makeEntry({ id: 4, title: 'Onsen ryokan', category: 'lodging' }),
    makeEntry({ id: 5, title: 'Something unfiled', category: null }),
  ];

  it('hides, never removes — the input array is untouched', () => {
    applyLibraryFilters(entries, { categories: ['food'], search: '' });
    expect(entries).toHaveLength(5);
  });

  it('filters by a single category', () => {
    expect(applyLibraryFilters(entries, { categories: ['activity'], search: '' }).map((e) => e.id)).toEqual([2]);
  });

  it('unions several categories rather than intersecting them', () => {
    // An entry carries exactly one category, so AND would return nothing here.
    expect(applyLibraryFilters(entries, { categories: ['food', 'place'], search: '' }).map((e) => e.id)).toEqual([1, 3]);
  });

  it('keeps the survivors of the still-lit chip when one is deselected', () => {
    const two: LibraryFilters = { categories: ['food', 'place'], search: '' };
    const one = toggleLibraryCategory(two, 'place');
    expect(applyLibraryFilters(entries, one).map((e) => e.id)).toEqual([3]);
  });

  it('restores the whole library once the last category goes out', () => {
    const one = toggleLibraryCategory(EMPTY_LIBRARY_FILTERS, 'food');
    expect(applyLibraryFilters(entries, toggleLibraryCategory(one, 'food'))).toHaveLength(5);
  });

  it('never matches an uncategorised entry against a lit chip', () => {
    expect(applyLibraryFilters(entries, { categories: ['place'], search: '' }).map((e) => e.id)).not.toContain(5);
  });

  it('filters by a case-insensitive title search', () => {
    expect(applyLibraryFilters(entries, { categories: [], search: 'ONSEN' }).map((e) => e.id)).toEqual([2, 4]);
  });

  it('ANDs the search term against the union of the lit chips', () => {
    // "Either of these kinds, and called this" — the chips union among
    // themselves, then intersect with the search.
    expect(applyLibraryFilters(entries, { categories: ['activity', 'lodging'], search: 'onsen' }).map((e) => e.id)).toEqual([
      2, 4,
    ]);
    expect(applyLibraryFilters(entries, { categories: ['activity'], search: 'ryokan' })).toHaveLength(0);
  });

  it('returns everything when nothing is narrowed', () => {
    expect(applyLibraryFilters(entries, EMPTY_LIBRARY_FILTERS)).toHaveLength(5);
  });
});
