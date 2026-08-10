import { describe, expect, it } from 'vitest';
import { EMPTY_MAP_FILTERS, applyMapFilters, isMapFiltersNarrowed } from './mapFilters';
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
    expect(isMapFiltersNarrowed({ category: 'food', scheduleState: 'all' })).toBe(true);
    expect(isMapFiltersNarrowed({ category: null, scheduleState: 'scheduled' })).toBe(true);
  });
});

describe('applyMapFilters', () => {
  const entries = [
    makeEntry({ id: 1, category: 'place', scheduled: true }),
    makeEntry({ id: 2, category: 'food', scheduled: false }),
    makeEntry({ id: 3, category: 'place', scheduled: false }),
  ];

  it('hides, never removes — the input array is untouched', () => {
    applyMapFilters(entries, { category: 'food', scheduleState: 'all' });
    expect(entries).toHaveLength(3);
  });

  it('filters by category', () => {
    expect(applyMapFilters(entries, { category: 'place', scheduleState: 'all' }).map((e) => e.id)).toEqual([1, 3]);
  });

  it('filters by schedule state', () => {
    expect(applyMapFilters(entries, { category: null, scheduleState: 'scheduled' }).map((e) => e.id)).toEqual([1]);
    expect(applyMapFilters(entries, { category: null, scheduleState: 'potential' }).map((e) => e.id)).toEqual([2, 3]);
  });

  it('returns everything when nothing is narrowed', () => {
    expect(applyMapFilters(entries, EMPTY_MAP_FILTERS)).toHaveLength(3);
  });
});
