import { describe, expect, it } from 'vitest';
import {
  counterLine,
  findDuplicateIdea,
  groupLocated,
  isNestedIdea,
  locatedDescendantCount,
  matchIdeas,
  metaLineFor,
  placelessIdeas,
} from './mapScreen';
import type { LocatedEntry } from './mapScreen';
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

/** A located entry — coordinates default to somewhere real so tests only spell the ones they assert on. */
function makeLocated(overrides: Partial<Entry> & { lat?: number; lng?: number }): LocatedEntry {
  return makeEntry({ lat: 35.0, lng: 135.0, ...overrides }) as LocatedEntry;
}

function ideaMapOf(ideas: Entry[]): Map<number, Entry> {
  return new Map(ideas.map((idea) => [idea.id, idea]));
}

describe('placelessIdeas', () => {
  it('keeps only the ideas the map cannot place', () => {
    const ideas = [
      makeEntry({ id: 1, lat: 35, lng: 135 }),
      makeEntry({ id: 2, lat: null, lng: null }),
      makeEntry({ id: 3, lat: 35, lng: 135 }),
    ];
    expect(placelessIdeas(ideas).map((e) => e.id)).toEqual([2]);
  });

  it('treats a half-geocoded idea as placeless — one coordinate is not a place', () => {
    // The placeless strip and the pin list must partition the input exactly;
    // an idea with only a lat must land here, not in neither list.
    const ideas = [makeEntry({ id: 1, lat: 35, lng: null }), makeEntry({ id: 2, lat: null, lng: 135 })];
    expect(placelessIdeas(ideas).map((e) => e.id)).toEqual([1, 2]);
  });

  it('is empty when every idea is placed, and for an empty list', () => {
    expect(placelessIdeas([makeEntry({ id: 1, lat: 0, lng: 0 })])).toEqual([]);
    expect(placelessIdeas([])).toEqual([]);
  });

  it('keeps an idea at coordinate zero — 0 is a place, null is not', () => {
    expect(placelessIdeas([makeEntry({ id: 1, lat: 0, lng: 0 })])).toEqual([]);
  });
});

describe('locatedDescendantCount', () => {
  it('counts located descendants at any depth, not just direct children', () => {
    const ideas = [
      makeEntry({ id: 1 }),
      makeEntry({ id: 2, parent_ids: [1], lat: 35, lng: 135 }),
      makeEntry({ id: 3, parent_ids: [2], lat: 36, lng: 136 }),
    ];
    expect(locatedDescendantCount(ideas, 1)).toBe(2);
  });

  it('ignores descendants without coordinates — the count promises pins, not subtree size', () => {
    const ideas = [
      makeEntry({ id: 1 }),
      makeEntry({ id: 2, parent_ids: [1], lat: 35, lng: 135 }),
      makeEntry({ id: 3, parent_ids: [1] }),
      makeEntry({ id: 4, parent_ids: [1], lat: 35, lng: null }), // half-geocoded is not on the map
    ];
    expect(locatedDescendantCount(ideas, 1)).toBe(1);
  });

  it('never counts the idea itself, even when it is located', () => {
    const ideas = [makeEntry({ id: 1, lat: 35, lng: 135 })];
    expect(locatedDescendantCount(ideas, 1)).toBe(0);
  });

  it('counts an idea reachable down two branches once — links are many-to-many', () => {
    const ideas = [
      makeEntry({ id: 1 }),
      makeEntry({ id: 2, parent_ids: [1] }),
      makeEntry({ id: 3, parent_ids: [1] }),
      makeEntry({ id: 4, parent_ids: [2, 3], lat: 35, lng: 135 }),
    ];
    expect(locatedDescendantCount(ideas, 1)).toBe(1);
  });

  it('survives a cycle in the links', () => {
    const ideas = [
      makeEntry({ id: 1, parent_ids: [2] }),
      makeEntry({ id: 2, parent_ids: [1], lat: 35, lng: 135 }),
    ];
    expect(locatedDescendantCount(ideas, 1)).toBe(1);
  });

  it('is zero for a leaf and for an id not in the list at all', () => {
    expect(locatedDescendantCount([makeEntry({ id: 1 })], 1)).toBe(0);
    expect(locatedDescendantCount([makeEntry({ id: 1, lat: 35, lng: 135 })], 99)).toBe(0);
  });
});

describe('metaLineFor', () => {
  it('joins address, parents, and the inside count with middots, in that order', () => {
    const parent = makeEntry({ id: 10, title: 'Old Town' });
    const entry = makeEntry({ id: 1, address: '1 Temple St', parent_ids: [10] });
    const child = makeEntry({ id: 2, parent_ids: [1], lat: 35, lng: 135 });
    const all = [parent, entry, child];
    expect(metaLineFor(entry, all, ideaMapOf(all))).toBe('1 Temple St · in Old Town · 1 inside is on the map');
  });

  it('lists several parents under a single "in", titles joined by middots', () => {
    // "in Rome · in Old Town" would read as a stutter — one prefix for the run.
    const a = makeEntry({ id: 10, title: 'Rome' });
    const b = makeEntry({ id: 11, title: 'Old Town' });
    const entry = makeEntry({ id: 1, parent_ids: [10, 11] });
    const all = [a, b, entry];
    expect(metaLineFor(entry, all, ideaMapOf(all))).toBe('in Rome · Old Town');
  });

  it('names only parents the idea map can vouch for — trip and unknown ids are skipped', () => {
    // parent_ids is unfiltered: it carries the trip entry, bundles, ideas on
    // other trips. A title this screen cannot resolve is a parent it has no
    // business claiming.
    const parent = makeEntry({ id: 10, title: 'Old Town' });
    const entry = makeEntry({ id: 1, parent_ids: [999, 10, 998] });
    const all = [parent, entry];
    expect(metaLineFor(entry, all, ideaMapOf(all))).toBe('in Old Town');
  });

  it('drops the "in" part entirely when no parent id resolves', () => {
    const entry = makeEntry({ id: 1, address: '1 Temple St', parent_ids: [999] });
    expect(metaLineFor(entry, [entry], ideaMapOf([entry]))).toBe('1 Temple St');
  });

  it('skips a null or whitespace-only address', () => {
    const noAddress = makeEntry({ id: 1, address: null });
    const blankAddress = makeEntry({ id: 2, address: '   ' });
    expect(metaLineFor(noAddress, [noAddress], ideaMapOf([noAddress]))).toBe('');
    expect(metaLineFor(blankAddress, [blankAddress], ideaMapOf([blankAddress]))).toBe('');
  });

  it('pluralises the inside count, and stays silent at zero', () => {
    const entry = makeEntry({ id: 1 });
    const kids = [
      makeEntry({ id: 2, parent_ids: [1], lat: 35, lng: 135 }),
      makeEntry({ id: 3, parent_ids: [1], lat: 36, lng: 136 }),
    ];
    expect(metaLineFor(entry, [entry, ...kids], ideaMapOf([entry, ...kids]))).toBe('2 inside are on the map');

    const unplacedKid = makeEntry({ id: 4, parent_ids: [1] });
    // A zero would be noise on almost every row — silence, not "0 inside".
    expect(metaLineFor(entry, [entry, unplacedKid], ideaMapOf([entry, unplacedKid]))).toBe('');
  });

  it('is the empty string when no part qualifies, so the row can skip the line', () => {
    const entry = makeEntry({ id: 1 });
    expect(metaLineFor(entry, [entry], ideaMapOf([entry]))).toBe('');
  });
});

describe('isNestedIdea', () => {
  it('is true when any parent is a known idea', () => {
    const entry = makeEntry({ id: 1, parent_ids: [999, 10] });
    expect(isNestedIdea(entry, new Set([10, 11]))).toBe(true);
  });

  it('is false when every parent is outside the idea set — a bundle or the trip is not nesting', () => {
    const entry = makeEntry({ id: 1, parent_ids: [999] });
    expect(isNestedIdea(entry, new Set([10, 11]))).toBe(false);
  });

  it('is false with no parents at all', () => {
    expect(isNestedIdea(makeEntry({ id: 1 }), new Set([10]))).toBe(false);
  });
});

describe('groupLocated', () => {
  const located = [
    makeLocated({ id: 1, title: 'Ramen', category: 'food' }),
    makeLocated({ id: 2, title: 'Shrine', category: 'place' }),
    makeLocated({ id: 3, title: 'Mystery', category: null }),
    makeLocated({ id: 4, title: 'Noodles', category: 'food' }),
  ];

  it("mode 'none' is one unlabelled section holding everything, in input order", () => {
    const groups = groupLocated(located, 'none');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('all');
    expect(groups[0]?.label).toBe('');
    expect(groups[0]?.entries.map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });

  it("mode 'none' with nothing located is no sections, not one empty one", () => {
    expect(groupLocated([], 'none')).toEqual([]);
  });

  it("mode 'category' sections in the board's canonical order, uncategorised last", () => {
    // Delegation to the board's groupEntries is the point under test: the
    // map's "By category" must be the board's, headings and order included.
    const groups = groupLocated(located, 'category');
    expect(groups.map((g) => g.label)).toEqual(['Place', 'Food', 'Uncategorised']);
    expect(groups.map((g) => g.entries.map((e) => e.id))).toEqual([[2], [1, 4], [3]]);
  });

  it("mode 'category' drops empty sections", () => {
    const groups = groupLocated([makeLocated({ id: 1, category: 'lodging' })], 'category');
    expect(groups.map((g) => g.key)).toEqual(['lodging']);
  });
});

describe('counterLine', () => {
  it('states the fraction while the list follows the viewport', () => {
    expect(counterLine(2, 5, true)).toBe('2 of 5 ideas on the map are in view');
  });

  it('keeps the verb agreeing with the located count, not the in-view count', () => {
    // The sentence is about the located set; re-agreeing with inView would
    // flip is/are as you pan. So "1 of 3 ideas ... are", by design.
    expect(counterLine(1, 3, true)).toBe('1 of 3 ideas on the map are in view');
    expect(counterLine(0, 3, true)).toBe('0 of 3 ideas on the map are in view');
  });

  it('goes fully singular only when a single idea is located', () => {
    expect(counterLine(1, 1, true)).toBe('1 of 1 idea on the map is in view');
    expect(counterLine(0, 1, true)).toBe('0 of 1 idea on the map is in view');
  });

  it('says in words that the map is not narrowing, when not following', () => {
    expect(counterLine(2, 5, false)).toBe('5 ideas have a place · the map is not narrowing the list');
  });

  it('ignores inView when not following — the viewport is not narrowing anything', () => {
    expect(counterLine(0, 5, false)).toBe(counterLine(5, 5, false));
  });

  it('pluralises the unfollowed line, zero included', () => {
    expect(counterLine(0, 1, false)).toBe('1 idea has a place · the map is not narrowing the list');
    expect(counterLine(0, 0, false)).toBe('0 ideas have a place · the map is not narrowing the list');
  });
});

describe('findDuplicateIdea', () => {
  it('finds an idea within the epsilon box', () => {
    const near = makeLocated({ id: 1, lat: 35.0001, lng: 135.0001 });
    expect(findDuplicateIdea({ lat: 35.0, lng: 135.0 }, [near])).toBe(near);
  });

  it('requires closeness on BOTH axes — 10 m north but 500 m east is a different place', () => {
    const eastOnly = makeLocated({ id: 1, lat: 35.0001, lng: 135.005 });
    const northOnly = makeLocated({ id: 2, lat: 35.005, lng: 135.0001 });
    expect(findDuplicateIdea({ lat: 35.0, lng: 135.0 }, [eastOnly, northOnly])).toBeUndefined();
  });

  it('picks the nearest candidate when several qualify', () => {
    const nearer = makeLocated({ id: 1, lat: 35.00005, lng: 135.00005 });
    const farther = makeLocated({ id: 2, lat: 35.0001, lng: 135.0001 });
    // Order-independent: nearest wins whichever way the list came.
    expect(findDuplicateIdea({ lat: 35.0, lng: 135.0 }, [farther, nearer])).toBe(nearer);
    expect(findDuplicateIdea({ lat: 35.0, lng: 135.0 }, [nearer, farther])).toBe(nearer);
  });

  it('treats the box edge as inside — exactly epsilon away still reads as the same place', () => {
    // Anchored at (0, 0) so the subtraction is exact: at real latitudes the
    // difference picks up an ulp of noise and the test would be asserting on
    // float rounding, not on the boundary rule.
    const onEdge = makeLocated({ id: 1, lat: 1.5e-4, lng: 0 });
    expect(findDuplicateIdea({ lat: 0, lng: 0 }, [onEdge])).toBe(onEdge);
  });

  it('finds an exact-coordinate duplicate — distance zero is the strongest match', () => {
    const same = makeLocated({ id: 1, lat: 35.0, lng: 135.0 });
    expect(findDuplicateIdea({ lat: 35.0, lng: 135.0 }, [same])).toBe(same);
  });

  it('is undefined when nothing is near, and for an empty list', () => {
    const far = makeLocated({ id: 1, lat: 36.0, lng: 136.0 });
    expect(findDuplicateIdea({ lat: 35.0, lng: 135.0 }, [far])).toBeUndefined();
    expect(findDuplicateIdea({ lat: 35.0, lng: 135.0 }, [])).toBeUndefined();
  });
});

describe('matchIdeas', () => {
  const located = [
    makeLocated({ id: 1, title: 'Senso-ji Temple' }),
    makeLocated({ id: 2, title: 'Ramen alley' }),
    makeLocated({ id: 3, title: 'Golden Temple viewpoint' }),
    makeLocated({ id: 4, title: 'Temple market' }),
  ];

  it('matches a case-insensitive substring anywhere in the title', () => {
    expect(matchIdeas('TEMPLE', located, 10).map((e) => e.id)).toEqual([1, 3, 4]);
    expect(matchIdeas('alley', located, 10).map((e) => e.id)).toEqual([2]);
  });

  it('trims the query before matching', () => {
    expect(matchIdeas('  ramen ', located, 10).map((e) => e.id)).toEqual([2]);
  });

  it('suggests nothing for an empty or whitespace-only query — no query means no suggestions', () => {
    // Opposite polarity from applyMapFilters on purpose: this feeds a
    // dropdown, where "no query" showing everything would be noise.
    expect(matchIdeas('', located, 10)).toEqual([]);
    expect(matchIdeas('   ', located, 10)).toEqual([]);
  });

  it('caps the list at max, keeping input order', () => {
    expect(matchIdeas('temple', located, 2).map((e) => e.id)).toEqual([1, 3]);
  });

  it('returns nothing when max is zero', () => {
    expect(matchIdeas('temple', located, 0)).toEqual([]);
  });

  it('is empty when nothing matches', () => {
    expect(matchIdeas('onsen', located, 10)).toEqual([]);
  });
});
