import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  NO_LOCATION_LABEL,
  applyFilters,
  groupByCategory,
  groupByLocation,
  groupEntries,
  isNarrowed,
  toggleCategory,
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
    parent_ids: [],
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
    const groups = groupByLocation(applyFilters(entries, { ...EMPTY_FILTERS, categories: ['food'] }));

    expect(groups.map((g) => g.label)).toEqual(['Gion', 'Namba']);
    expect(groups.flatMap((g) => g.entries.map((e) => e.id))).toEqual([1, 3]);
  });

  it('drops a place bucket entirely once nothing in it survives the filter', () => {
    const groups = groupByLocation(applyFilters(entries, { ...EMPTY_FILTERS, categories: ['place'] }));
    expect(groups.map((g) => g.label)).toEqual(['Gion']);
  });
});

// Ideas carry exactly one category, so two selected categories can only ever
// mean "either of these" — an intersection would always be empty. Union is
// also what the chips look like they promise: each lit chip adds its ideas.
describe('applyFilters — categories are a union, not a choice', () => {
  const entries = [
    makeEntry({ id: 1, category: 'food' }),
    makeEntry({ id: 2, category: 'place' }),
    makeEntry({ id: 3, category: 'lodging' }),
    makeEntry({ id: 4, category: null }),
  ];

  function idsFor(categories: Parameters<typeof toggleCategory>[0]) {
    return applyFilters(entries, { ...EMPTY_FILTERS, categories }).map((e) => e.id);
  }

  it('shows ideas in ANY of two selected categories', () => {
    expect(idsFor(['food', 'place'])).toEqual([1, 2]);
  });

  it('keeps the other category when one of the two is deselected', () => {
    const remaining = toggleCategory(['food', 'place'], 'food');
    expect(remaining).toEqual(['place']);
    expect(idsFor(remaining)).toEqual([2]);
  });

  it('widens as each further category is added, never replacing the last', () => {
    expect(idsFor(['food'])).toEqual([1]);
    expect(idsFor(['food', 'place'])).toEqual([1, 2]);
    expect(idsFor(['food', 'place', 'lodging'])).toEqual([1, 2, 3]);
  });

  it('treats an empty selection as no narrowing at all, not as "show nothing"', () => {
    expect(idsFor([])).toEqual([1, 2, 3, 4]);
  });

  // Clearing every chip has to land back on the whole list, or "See all" would
  // be the only way home from a filter the user built one click at a time.
  it('restores everything once the last category is deselected', () => {
    const cleared = toggleCategory(toggleCategory(['food', 'place'], 'food'), 'place');
    expect(cleared).toEqual([]);
    expect(idsFor(cleared)).toEqual([1, 2, 3, 4]);
  });

  it('steps an uncategorised idea aside while any category is selected', () => {
    expect(idsFor(['food', 'place', 'lodging'])).not.toContain(4);
  });

  it('still composes with the other narrowings', () => {
    const mixed = applyFilters(
      [
        makeEntry({ id: 1, category: 'food', scheduled: true }),
        makeEntry({ id: 2, category: 'place', scheduled: false }),
        makeEntry({ id: 3, category: 'place', scheduled: true }),
      ],
      { ...EMPTY_FILTERS, categories: ['food', 'place'], scheduleState: 'scheduled' },
    );
    expect(mixed.map((e) => e.id)).toEqual([1, 3]);
  });
});

// The search box is a filter, not a mode: it stacks with the chips and clears
// like them. Substring on the title only, case folded — nothing cleverer.
describe('applyFilters — text', () => {
  const entries = [
    makeEntry({ id: 1, title: 'Nanzen-ji' }),
    makeEntry({ id: 2, title: 'Kiyamachi at night', category: 'activity' }),
    makeEntry({ id: 3, title: 'Ramen alley', category: 'food' }),
  ];

  function idsFor(text: string) {
    return applyFilters(entries, { ...EMPTY_FILTERS, text }).map((e) => e.id);
  }

  it('narrows to titles containing the text', () => {
    expect(idsFor('ramen')).toEqual([3]);
  });

  it('matches without caring about case, in either direction', () => {
    expect(idsFor('KIYAMACHI')).toEqual([2]);
    expect(idsFor('nanzen')).toEqual([1]);
  });

  it('matches anywhere in the title, not just the start', () => {
    expect(idsFor('night')).toEqual([2]);
  });

  it('treats empty and whitespace-only text as no narrowing at all', () => {
    expect(idsFor('')).toEqual([1, 2, 3]);
    expect(idsFor('   ')).toEqual([1, 2, 3]);
  });

  it('ignores surrounding whitespace around a real query', () => {
    expect(idsFor('  ramen  ')).toEqual([3]);
  });

  it('stacks with the category chips rather than replacing them', () => {
    const mixed = applyFilters(entries, { ...EMPTY_FILTERS, categories: ['food'], text: 'alley' });
    expect(mixed.map((e) => e.id)).toEqual([3]);

    const conflict = applyFilters(entries, { ...EMPTY_FILTERS, categories: ['food'], text: 'nanzen' });
    expect(conflict).toEqual([]);
  });
});

describe('toggleCategory', () => {
  it('adds a category that is off and removes one that is on', () => {
    expect(toggleCategory([], 'food')).toEqual(['food']);
    expect(toggleCategory(['food'], 'food')).toEqual([]);
  });

  // Canonical CATEGORY_ORDER, not click order: the same set of lit chips is the
  // same array however you got there, so equal selections compare equal.
  it('keeps the result in CATEGORY_ORDER whichever order the chips were clicked', () => {
    expect(toggleCategory(['food'], 'place')).toEqual(['place', 'food']);
    expect(toggleCategory(['place'], 'food')).toEqual(['place', 'food']);
  });

  it('never mutates the array it was given', () => {
    const before: Parameters<typeof toggleCategory>[0] = ['food'];
    toggleCategory(before, 'place');
    expect(before).toEqual(['food']);
  });

  it('is its own undo', () => {
    expect(toggleCategory(toggleCategory(['food'], 'place'), 'place')).toEqual(['food']);
  });
});

describe('isNarrowed', () => {
  it('is false for the resting state', () => {
    expect(isNarrowed(EMPTY_FILTERS)).toBe(false);
  });

  it('is true for one selected category and for several', () => {
    expect(isNarrowed({ ...EMPTY_FILTERS, categories: ['food'] })).toBe(true);
    expect(isNarrowed({ ...EMPTY_FILTERS, categories: ['food', 'place'] })).toBe(true);
  });

  it('is false again once the last category is deselected', () => {
    expect(isNarrowed({ ...EMPTY_FILTERS, categories: [] })).toBe(false);
  });

  it('still notices the non-category narrowings on their own', () => {
    expect(isNarrowed({ ...EMPTY_FILTERS, hasLocation: true })).toBe(true);
    expect(isNarrowed({ ...EMPTY_FILTERS, scheduleState: 'scheduled' })).toBe(true);
  });

  it('counts search text as a narrowing, but not a whitespace-only one', () => {
    expect(isNarrowed({ ...EMPTY_FILTERS, text: 'ramen' })).toBe(true);
    expect(isNarrowed({ ...EMPTY_FILTERS, text: '   ' })).toBe(false);
  });
});
