import { describe, expect, it } from 'vitest';
import { EMPTY_MAP_FILTERS, applyMapFilters, isMapFiltersNarrowed, toggleMapCategory } from './mapFilters';
import type { MapFilters } from './mapFilters';
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

describe('isMapFiltersNarrowed', () => {
  it('is false for the empty filter set', () => {
    expect(isMapFiltersNarrowed(EMPTY_MAP_FILTERS)).toBe(false);
  });

  it('is true once a category or schedule state is picked', () => {
    expect(isMapFiltersNarrowed({ categories: ['food'], scheduleState: 'all' })).toBe(true);
    expect(isMapFiltersNarrowed({ categories: [], scheduleState: 'scheduled' })).toBe(true);
  });

  it('is still true with several categories lit, and false again once the last goes out', () => {
    expect(isMapFiltersNarrowed({ categories: ['food', 'lodging'], scheduleState: 'all' })).toBe(true);
    expect(isMapFiltersNarrowed({ categories: [], scheduleState: 'all' })).toBe(false);
  });
});

describe('toggleMapCategory', () => {
  it('adds on select and removes on re-select, leaving the rest of the selection alone', () => {
    const one = toggleMapCategory(EMPTY_MAP_FILTERS, 'food');
    expect(one.categories).toEqual(['food']);

    const two = toggleMapCategory(one, 'lodging');
    expect(two.categories).toEqual(['food', 'lodging']); // click order: appended

    const back = toggleMapCategory(two, 'food');
    expect(back.categories).toEqual(['lodging']); // the other chip stays lit
  });

  it('leaves the other filters untouched and never mutates the input', () => {
    const before: MapFilters = { categories: ['food'], scheduleState: 'scheduled' };
    const after = toggleMapCategory(before, 'place');
    expect(after.scheduleState).toBe('scheduled');
    expect(before.categories).toEqual(['food']);
  });
});

describe('applyMapFilters', () => {
  const entries = [
    makeEntry({ id: 1, category: 'place', scheduled: true }),
    makeEntry({ id: 2, category: 'food', scheduled: false }),
    makeEntry({ id: 3, category: 'place', scheduled: false }),
    makeEntry({ id: 4, category: 'lodging', scheduled: false }),
    makeEntry({ id: 5, category: null, scheduled: false }),
  ];

  it('hides, never removes — the input array is untouched', () => {
    applyMapFilters(entries, { categories: ['food'], scheduleState: 'all' });
    expect(entries).toHaveLength(5);
  });

  it('filters by a single category', () => {
    expect(applyMapFilters(entries, { categories: ['place'], scheduleState: 'all' }).map((e) => e.id)).toEqual([1, 3]);
  });

  it('unions several categories rather than intersecting them', () => {
    // An entry carries exactly one category, so AND would return nothing here —
    // two lit chips have to mean "either of these" to mean anything at all.
    expect(applyMapFilters(entries, { categories: ['food', 'lodging'], scheduleState: 'all' }).map((e) => e.id)).toEqual([
      2, 4,
    ]);
  });

  it('keeps the survivors of the still-lit chip when one is deselected', () => {
    const two: MapFilters = { categories: ['food', 'lodging'], scheduleState: 'all' };
    const one = toggleMapCategory(two, 'lodging');
    expect(applyMapFilters(entries, one).map((e) => e.id)).toEqual([2]);
  });

  it('restores the whole map once the last category goes out', () => {
    const one = toggleMapCategory(EMPTY_MAP_FILTERS, 'food');
    expect(applyMapFilters(entries, toggleMapCategory(one, 'food'))).toHaveLength(5);
  });

  it('never matches an uncategorised entry against a lit chip', () => {
    expect(applyMapFilters(entries, { categories: ['place'], scheduleState: 'all' }).map((e) => e.id)).not.toContain(5);
  });

  it('narrows by category and schedule state together', () => {
    expect(
      applyMapFilters(entries, { categories: ['place', 'food'], scheduleState: 'potential' }).map((e) => e.id),
    ).toEqual([2, 3]);
  });

  it('filters by schedule state', () => {
    expect(applyMapFilters(entries, { categories: [], scheduleState: 'scheduled' }).map((e) => e.id)).toEqual([1]);
    expect(applyMapFilters(entries, { categories: [], scheduleState: 'potential' }).map((e) => e.id)).toEqual([
      2, 3, 4, 5,
    ]);
  });

  it('returns everything when nothing is narrowed', () => {
    expect(applyMapFilters(entries, EMPTY_MAP_FILTERS)).toHaveLength(5);
  });
});
