import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  NO_LOCATION_LABEL,
  applyFilters,
  groupByCategory,
  groupByLocation,
  groupEntries,
} from './filters';
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

describe('groupByLocation', () => {
  it('buckets by location name, alphabetically', () => {
    const groups = groupByLocation([
      makeEntry({ id: 1, location_name: 'Osaka minami' }),
      makeEntry({ id: 2, location_name: 'Kyoto east' }),
      makeEntry({ id: 3, location_name: 'Kyoto east' }),
    ]);

    expect(groups.map((g) => g.label)).toEqual(['Kyoto east', 'Osaka minami']);
    expect(groups[0]?.entries.map((e) => e.id)).toEqual([2, 3]);
  });

  it('keeps entry order stable inside a bucket', () => {
    const groups = groupByLocation([
      makeEntry({ id: 9, location_name: 'Gion' }),
      makeEntry({ id: 4, location_name: 'Gion' }),
      makeEntry({ id: 7, location_name: 'Gion' }),
    ]);

    expect(groups[0]?.entries.map((e) => e.id)).toEqual([9, 4, 7]);
  });

  // Location is free text a person typed, not a foreign key. Folding case would
  // silently merge two places they deliberately wrote apart, with no way back.
  it('matches exactly — differently-cased names stay separate buckets', () => {
    const groups = groupByLocation([
      makeEntry({ id: 1, location_name: 'kyoto' }),
      makeEntry({ id: 2, location_name: 'Kyoto' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.entries.length)).toEqual([1, 1]);
  });

  it('trims surrounding whitespace so "Gion " and "Gion" are one place', () => {
    const groups = groupByLocation([
      makeEntry({ id: 1, location_name: 'Gion ' }),
      makeEntry({ id: 2, location_name: 'Gion' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Gion');
    expect(groups[0]?.entries).toHaveLength(2);
  });

  it('collects nulls, empties and whitespace into one "No location" bucket, last', () => {
    const groups = groupByLocation([
      makeEntry({ id: 1, location_name: null }),
      makeEntry({ id: 2, location_name: 'Zoo' }),
      makeEntry({ id: 3, location_name: '' }),
      makeEntry({ id: 4, location_name: '   ' }),
      makeEntry({ id: 5, location_name: 'Arashiyama' }),
    ]);

    expect(groups.map((g) => g.label)).toEqual(['Arashiyama', 'Zoo', NO_LOCATION_LABEL]);
    expect(groups[2]?.entries.map((e) => e.id)).toEqual([1, 3, 4]);
  });

  it('omits the "No location" bucket when every idea has one', () => {
    const groups = groupByLocation([makeEntry({ id: 1, location_name: 'Gion' })]);
    expect(groups.map((g) => g.label)).toEqual(['Gion']);
  });

  it('emits no groups at all for an empty list', () => {
    expect(groupByLocation([])).toEqual([]);
  });

  it('groups without dropping or duplicating anything', () => {
    const entries = [
      makeEntry({ id: 1, location_name: 'Gion' }),
      makeEntry({ id: 2, location_name: null }),
      makeEntry({ id: 3, location_name: 'Namba' }),
      makeEntry({ id: 4, location_name: 'Gion' }),
    ];

    const grouped = groupByLocation(entries).flatMap((g) => g.entries.map((e) => e.id));

    expect(grouped.slice().sort()).toEqual([1, 2, 3, 4]);
    expect(entries).toHaveLength(4);
  });

  it('returns the same shape as groupByCategory, so one renderer serves both', () => {
    const entries = [makeEntry({ id: 1, category: 'food', location_name: 'Gion' })];
    expect(Object.keys(groupByLocation(entries)[0] ?? {}).sort()).toEqual(
      Object.keys(groupByCategory(entries)[0] ?? {}).sort(),
    );
  });
});

describe('groupEntries', () => {
  const entries = [
    makeEntry({ id: 1, category: 'food', location_name: 'Gion' }),
    makeEntry({ id: 2, category: 'place', location_name: 'Namba' }),
  ];

  it("dispatches to each mode's grouping", () => {
    expect(groupEntries(entries, 'category').map((g) => g.label)).toEqual(['Place', 'Food']);
    expect(groupEntries(entries, 'location').map((g) => g.label)).toEqual(['Gion', 'Namba']);
  });

  it("gives 'none' a single unlabelled section holding everything", () => {
    const groups = groupEntries(entries, 'none');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('');
    expect(groups[0]?.entries.map((e) => e.id)).toEqual([1, 2]);
  });

  it('yields the on-screen order in every mode, for shift-click ranges', () => {
    for (const mode of ['none', 'category', 'location'] as const) {
      const ordered = groupEntries(entries, mode).flatMap((g) => g.entries.map((e) => e.id));
      expect(ordered.slice().sort()).toEqual([1, 2]);
    }
  });

  it('emits nothing for an empty list in every mode', () => {
    for (const mode of ['none', 'category', 'location'] as const) {
      expect(groupEntries([], mode)).toEqual([]);
    }
  });
});

// Grouping is presentation; filtering is what narrows. They must compose, so
// that "only food, grouped by place" is one obvious thing and not a conflict.
describe('filtering and grouping are orthogonal', () => {
  const entries = [
    makeEntry({ id: 1, category: 'food', location_name: 'Gion' }),
    makeEntry({ id: 2, category: 'place', location_name: 'Gion' }),
    makeEntry({ id: 3, category: 'food', location_name: 'Namba' }),
  ];

  it('groups by place what the category filter left behind', () => {
    const groups = groupByLocation(applyFilters(entries, { ...EMPTY_FILTERS, category: 'food' }));

    expect(groups.map((g) => g.label)).toEqual(['Gion', 'Namba']);
    expect(groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual([1, 3]);
  });

  it('drops a place bucket entirely once nothing in it survives the filter', () => {
    const groups = groupByLocation(applyFilters(entries, { ...EMPTY_FILTERS, category: 'place' }));
    expect(groups.map((g) => g.label)).toEqual(['Gion']);
  });
});
