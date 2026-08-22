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

describe('isMapFiltersNarrowed', () => {
  it('is false for the empty filter set', () => {
    expect(isMapFiltersNarrowed(EMPTY_MAP_FILTERS)).toBe(false);
  });

  it('is true once a category or schedule state is picked', () => {
    expect(isMapFiltersNarrowed({ categories: ['food'], scheduleState: 'all', text: '' })).toBe(true);
    expect(isMapFiltersNarrowed({ categories: [], scheduleState: 'scheduled', text: '' })).toBe(true);
  });

  it('is true once text is typed, but not for whitespace applyMapFilters would ignore', () => {
    // "Narrowed" gates the widen affordance, so it must track exactly what
    // applyMapFilters acts on — a query of spaces narrows nothing and must
    // not light it up.
    expect(isMapFiltersNarrowed({ ...EMPTY_MAP_FILTERS, text: 'temple' })).toBe(true);
    expect(isMapFiltersNarrowed({ ...EMPTY_MAP_FILTERS, text: '   ' })).toBe(false);
  });

  it('is still true with several categories lit, and false again once the last goes out', () => {
    expect(isMapFiltersNarrowed({ categories: ['food', 'lodging'], scheduleState: 'all', text: '' })).toBe(true);
    expect(isMapFiltersNarrowed({ categories: [], scheduleState: 'all', text: '' })).toBe(false);
  });
});

describe('toggleMapCategory', () => {
  it('adds on select and removes on re-select, leaving the rest of the selection alone', () => {
    const one = toggleMapCategory(EMPTY_MAP_FILTERS, 'food');
    expect(one.categories).toEqual(['food']);

    const two = toggleMapCategory(one, 'lodging');
    expect(two.categories).toEqual(['food', 'lodging']); // canonical CATEGORY_ORDER

    const back = toggleMapCategory(two, 'food');
    expect(back.categories).toEqual(['lodging']); // the other chip stays lit
  });

  it('gives the same array for the same set of chips, whichever order they were clicked', () => {
    // 'place' precedes 'food' in CATEGORY_ORDER, so a click-ordered result would
    // differ between these two and a canonical one cannot.
    const foodThenPlace = toggleMapCategory(toggleMapCategory(EMPTY_MAP_FILTERS, 'food'), 'place');
    const placeThenFood = toggleMapCategory(toggleMapCategory(EMPTY_MAP_FILTERS, 'place'), 'food');
    expect(foodThenPlace.categories).toEqual(['place', 'food']);
    expect(placeThenFood.categories).toEqual(['place', 'food']);
  });

  it('leaves the other filters untouched and never mutates the input', () => {
    const before: MapFilters = { categories: ['food'], scheduleState: 'scheduled', text: '' };
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
    applyMapFilters(entries, { categories: ['food'], scheduleState: 'all', text: '' });
    expect(entries).toHaveLength(5);
  });

  it('filters by a single category', () => {
    expect(applyMapFilters(entries, { categories: ['place'], scheduleState: 'all', text: '' }).map((e) => e.id)).toEqual([1, 3]);
  });

  it('unions several categories rather than intersecting them', () => {
    // An entry carries exactly one category, so AND would return nothing here —
    // two lit chips have to mean "either of these" to mean anything at all.
    expect(applyMapFilters(entries, { categories: ['food', 'lodging'], scheduleState: 'all', text: '' }).map((e) => e.id)).toEqual([
      2, 4,
    ]);
  });

  it('keeps the survivors of the still-lit chip when one is deselected', () => {
    const two: MapFilters = { categories: ['food', 'lodging'], scheduleState: 'all', text: '' };
    const one = toggleMapCategory(two, 'lodging');
    expect(applyMapFilters(entries, one).map((e) => e.id)).toEqual([2]);
  });

  it('restores the whole map once the last category goes out', () => {
    const one = toggleMapCategory(EMPTY_MAP_FILTERS, 'food');
    expect(applyMapFilters(entries, toggleMapCategory(one, 'food'))).toHaveLength(5);
  });

  it('never matches an uncategorised entry against a lit chip', () => {
    expect(applyMapFilters(entries, { categories: ['place'], scheduleState: 'all', text: '' }).map((e) => e.id)).not.toContain(5);
  });

  it('narrows by category and schedule state together', () => {
    expect(
      applyMapFilters(entries, { categories: ['place', 'food'], scheduleState: 'potential', text: '' }).map((e) => e.id),
    ).toEqual([2, 3]);
  });

  it('filters by schedule state', () => {
    expect(applyMapFilters(entries, { categories: [], scheduleState: 'scheduled', text: '' }).map((e) => e.id)).toEqual([1]);
    expect(applyMapFilters(entries, { categories: [], scheduleState: 'potential', text: '' }).map((e) => e.id)).toEqual([
      2, 3, 4, 5,
    ]);
  });

  it('returns everything when nothing is narrowed', () => {
    expect(applyMapFilters(entries, EMPTY_MAP_FILTERS)).toHaveLength(5);
  });

  describe('text', () => {
    const titled = [
      makeEntry({ id: 1, title: 'Senso-ji Temple', category: 'place' }),
      makeEntry({ id: 2, title: 'Ramen alley', category: 'food', scheduled: true }),
      makeEntry({ id: 3, title: 'Golden Temple viewpoint', category: 'place' }),
      makeEntry({ id: 4, title: 'Hotel by the river', category: 'lodging' }),
    ];

    it('narrows by case-insensitive title substring', () => {
      expect(applyMapFilters(titled, { ...EMPTY_MAP_FILTERS, text: 'TEMPLE' }).map((e) => e.id)).toEqual([1, 3]);
      expect(applyMapFilters(titled, { ...EMPTY_MAP_FILTERS, text: 'ramen' }).map((e) => e.id)).toEqual([2]);
    });

    it('matches anywhere in the title, not just the start', () => {
      expect(applyMapFilters(titled, { ...EMPTY_MAP_FILTERS, text: 'river' }).map((e) => e.id)).toEqual([4]);
    });

    it('trims the query before matching', () => {
      expect(applyMapFilters(titled, { ...EMPTY_MAP_FILTERS, text: '  temple  ' }).map((e) => e.id)).toEqual([1, 3]);
    });

    it('narrows nothing on whitespace-only text — a stray space cannot blank the map', () => {
      expect(applyMapFilters(titled, { ...EMPTY_MAP_FILTERS, text: '   ' })).toHaveLength(4);
    });

    it('stacks with the chips and the schedule state instead of replacing them', () => {
      const filters: MapFilters = { categories: ['place'], scheduleState: 'potential', text: 'temple' };
      expect(applyMapFilters(titled, filters).map((e) => e.id)).toEqual([1, 3]);
      // The same text over a different chip keeps the intersection honest.
      expect(applyMapFilters(titled, { ...filters, categories: ['food'] })).toHaveLength(0);
    });

    it('hides everything, not errors, when nothing matches', () => {
      expect(applyMapFilters(titled, { ...EMPTY_MAP_FILTERS, text: 'onsen' })).toEqual([]);
    });
  });
});
