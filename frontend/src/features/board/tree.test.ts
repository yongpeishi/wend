import { describe, expect, it } from 'vitest';
import { ideaChildrenOf, otherParentTitles, pathToIdea, rootIdeas, subtreeCount, subtreeIdeaIds } from './tree';
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

const idea = (id: number, title: string, parentIds: number[] = []) =>
  makeEntry({ id, title, parent_ids: parentIds });

// A small trip: 1 is the trip entry and 90 a bundle — neither is in the idea
// set, but both appear in parent_ids exactly as the serializer ships them.
//
//   day-trip (10)            ramen (20, under the trip only)
//   ├─ temple (11)
//   │  └─ teahouse (12)
//   └─ market (13, ALSO inside ramen — the multi-parent diamond's start)
const dayTrip = idea(10, 'Day trip east', [1]);
const temple = idea(11, 'The temple', [10]);
const teahouse = idea(12, 'Teahouse nearby', [11]);
const market = idea(13, 'Morning market', [10, 20]);
const ramen = idea(20, 'Ramen hunt', [1, 90]);
const IDEAS = [dayTrip, temple, teahouse, market, ramen];

describe('ideaChildrenOf', () => {
  it('returns the ideas one level down, and only those', () => {
    expect(ideaChildrenOf(IDEAS, 10).map((e) => e.id)).toEqual([11, 13]);
    expect(ideaChildrenOf(IDEAS, 11).map((e) => e.id)).toEqual([12]);
  });

  it('is empty for a leaf and for an id that is not here at all', () => {
    expect(ideaChildrenOf(IDEAS, 12)).toEqual([]);
    expect(ideaChildrenOf(IDEAS, 999)).toEqual([]);
  });

  it('lists a multi-parent idea under each of its parents', () => {
    expect(ideaChildrenOf(IDEAS, 10).map((e) => e.id)).toContain(13);
    expect(ideaChildrenOf(IDEAS, 20).map((e) => e.id)).toContain(13);
  });
});

describe('rootIdeas', () => {
  it('treats parents outside the idea set (trip, bundles) as no parent at all', () => {
    // dayTrip hangs off the trip, ramen off the trip and a bundle — both root.
    expect(rootIdeas(IDEAS).map((e) => e.id)).toEqual([10, 20]);
  });

  it('keeps an idea out of the root while any of its parents is a listed idea', () => {
    expect(rootIdeas(IDEAS).map((e) => e.id)).not.toContain(13);
  });

  it('promotes a child to root once its only idea parent leaves the set', () => {
    const without = IDEAS.filter((e) => e.id !== 11);
    // teahouse's parent (11) is gone, so it surfaces rather than vanishing.
    expect(rootIdeas(without).map((e) => e.id)).toContain(12);
  });

  it('is everything when nothing is nested, and nothing when the list is empty', () => {
    expect(rootIdeas([idea(1, 'a'), idea(2, 'b')])).toHaveLength(2);
    expect(rootIdeas([])).toEqual([]);
  });
});

describe('subtreeCount', () => {
  it('counts descendants at every depth, not just direct children', () => {
    // temple + teahouse + market under the day trip.
    expect(subtreeCount(IDEAS, 10)).toBe(3);
    expect(subtreeCount(IDEAS, 11)).toBe(1);
  });

  it('is zero for a leaf', () => {
    expect(subtreeCount(IDEAS, 12)).toBe(0);
  });

  it('counts an idea reachable down two branches once — the diamond', () => {
    //     top (1)
    //    /       \
    //  left (2) right (3)
    //    \       /
    //    bottom (4)
    const diamond = [
      idea(1, 'top'),
      idea(2, 'left', [1]),
      idea(3, 'right', [1]),
      idea(4, 'bottom', [2, 3]),
    ];
    expect(subtreeCount(diamond, 1)).toBe(3);
  });

  it('terminates on a cycle and counts each idea in the loop once', () => {
    // 1 -> 2 -> 3 -> back to 1. From 1 the descendants are 2 and 3; the walk
    // reaches 1 again and must neither loop nor count 1 as its own descendant.
    const cycle = [idea(1, 'a', [3]), idea(2, 'b', [1]), idea(3, 'c', [2])];
    expect(subtreeCount(cycle, 1)).toBe(2);
    expect(subtreeCount(cycle, 2)).toBe(2);
  });
});

describe('subtreeIdeaIds', () => {
  it('names every descendant at every depth, and never the idea itself', () => {
    expect(subtreeIdeaIds(IDEAS, 10)).toEqual(new Set([11, 12, 13]));
    expect(subtreeIdeaIds(IDEAS, 11)).toEqual(new Set([12]));
  });

  it('is empty for a leaf and for an id that is not here at all', () => {
    expect(subtreeIdeaIds(IDEAS, 12)).toEqual(new Set());
    expect(subtreeIdeaIds(IDEAS, 999)).toEqual(new Set());
  });

  it('holds a diamond-reachable idea once, like the count it backs', () => {
    const diamond = [
      idea(1, 'top'),
      idea(2, 'left', [1]),
      idea(3, 'right', [1]),
      idea(4, 'bottom', [2, 3]),
    ];
    expect(subtreeIdeaIds(diamond, 1)).toEqual(new Set([2, 3, 4]));
  });

  it('terminates on a cycle and leaves the starting idea out of its own subtree', () => {
    // 1 -> 2 -> 3 -> back to 1. The walk reaches 1 again and must neither
    // loop nor claim 1 as its own descendant.
    const cycle = [idea(1, 'a', [3]), idea(2, 'b', [1]), idea(3, 'c', [2])];
    expect(subtreeIdeaIds(cycle, 1)).toEqual(new Set([2, 3]));
    expect(subtreeIdeaIds(cycle, 3)).toEqual(new Set([1, 2]));
  });

  it('agrees with subtreeCount, which reads its number off this set', () => {
    for (const entry of IDEAS) {
      expect(subtreeCount(IDEAS, entry.id)).toBe(subtreeIdeaIds(IDEAS, entry.id).size);
    }
  });
});

describe('pathToIdea', () => {
  it('is empty for a root idea — its level is the root already', () => {
    expect(pathToIdea(IDEAS, 10)).toEqual([]);
    expect(pathToIdea(IDEAS, 20)).toEqual([]);
  });

  it('names a single idea parent as a one-crumb path', () => {
    expect(pathToIdea(IDEAS, 11)).toEqual([10]);
  });

  it('walks a deep chain root first', () => {
    // teahouse (12) sits inside the temple (11) inside the day trip (10).
    expect(pathToIdea(IDEAS, 12)).toEqual([10, 11]);
  });

  it('takes the FIRST idea parent when there are several', () => {
    // market's parents are the day trip (10) and ramen (20), in that order —
    // one chain has to be picked, and it is the first-listed one.
    expect(pathToIdea(IDEAS, 13)).toEqual([10]);
  });

  it('ignores parents outside the idea set — the trip, a bundle', () => {
    // ramen's parents are the trip (1) and a bundle (90); neither is an idea
    // here, so ramen is root and its path is empty rather than a guess.
    expect(pathToIdea(IDEAS, 20)).toEqual([]);
  });

  it('terminates on a cycle, stopping before any id repeats', () => {
    // 1 -> 2 -> 3 -> back to 1. Walking up from 1 must visit each ancestor
    // once and stop rather than orbiting the loop.
    const cycle = [idea(1, 'a', [3]), idea(2, 'b', [1]), idea(3, 'c', [2])];
    expect(pathToIdea(cycle, 1)).toEqual([2, 3]);
    expect(pathToIdea(cycle, 2)).toEqual([3, 1]);
  });
});

describe('otherParentTitles', () => {
  it('names the parents that are ideas, skipping the level on screen', () => {
    // market sits under the day trip (10) and ramen (20); viewed from inside
    // the day trip, only ramen is news.
    expect(otherParentTitles(IDEAS, market, 10)).toEqual(['Ramen hunt']);
  });

  it('names every idea parent at root, where no level is implied', () => {
    expect(otherParentTitles(IDEAS, market, null)).toEqual(['Day trip east', 'Ramen hunt']);
  });

  it('never names a parent it cannot resolve to a listed idea', () => {
    // ramen's parents are the trip (1) and a bundle (90) — neither is an idea
    // here, so there is nothing this board may claim.
    expect(otherParentTitles(IDEAS, ramen, null)).toEqual([]);
  });

  it('is empty once the only idea parent is the excluded one', () => {
    expect(otherParentTitles(IDEAS, temple, 10)).toEqual([]);
  });
});
