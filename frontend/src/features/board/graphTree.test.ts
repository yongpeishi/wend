import { describe, expect, it } from 'vitest';
import { buildTreeFromGraph } from './graphTree';
import type { Entry, EntryGraphResponse } from '../../api/types';

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

// A small DAG: trip 1 holds bundle 2 and idea 5; bundle 2 holds ideas 3 and 4;
// idea 4 ALSO hangs directly under the trip (two parents).
function makeResponse(): EntryGraphResponse {
  return {
    entry: makeEntry({ id: 1, kind: 'trip', title: 'Trip' }),
    entries: [
      makeEntry({ id: 2, kind: 'bundle', title: 'Bundle' }),
      makeEntry({ id: 3, title: 'First in bundle' }),
      makeEntry({ id: 4, title: 'Second in bundle, also under trip' }),
      makeEntry({ id: 5, title: 'Loose idea' }),
    ],
    // Deliberately shuffled: order must come from (parent_id, position), not
    // from the wire.
    links: [
      { parent_id: 2, child_id: 4, position: 1 },
      { parent_id: 1, child_id: 5, position: 2 },
      { parent_id: 2, child_id: 3, position: 0 },
      { parent_id: 1, child_id: 2, position: 0 },
      { parent_id: 1, child_id: 4, position: 1 },
    ],
  };
}

describe('buildTreeFromGraph', () => {
  it('returns children in position order, including the root’s own children', () => {
    const tree = buildTreeFromGraph(makeResponse());
    expect(tree.childrenOf(1).map((e) => e.id)).toEqual([2, 4, 5]);
    expect(tree.childrenOf(2).map((e) => e.id)).toEqual([3, 4]);
  });

  it('answers [] for leaves and unknown ids', () => {
    const tree = buildTreeFromGraph(makeResponse());
    expect(tree.childrenOf(5)).toEqual([]);
    expect(tree.childrenOf(999)).toEqual([]);
    expect(tree.parentsOf(999)).toEqual([]);
  });

  it('lists parents within the graph, and none for the root', () => {
    const tree = buildTreeFromGraph(makeResponse());
    expect(tree.parentsOf(4).map((e) => e.id)).toEqual([1, 2]);
    expect(tree.parentsOf(3).map((e) => e.id)).toEqual([2]);
    expect(tree.parentsOf(1)).toEqual([]);
  });

  it('counts parents per node for the "also under" chips', () => {
    const tree = buildTreeFromGraph(makeResponse());
    expect(tree.parentCount.get(4)).toBe(2);
    expect(tree.parentCount.get(3)).toBe(1);
    expect(tree.parentCount.get(1)).toBeUndefined();
  });

  it('includes the root in the entries lookup', () => {
    const tree = buildTreeFromGraph(makeResponse());
    expect(tree.entryById.get(1)?.title).toBe('Trip');
    expect(tree.root.id).toBe(1);
    expect(tree.entryById.size).toBe(5);
  });

  it('skips links whose endpoint is missing from the visible set', () => {
    const response = makeResponse();
    // The server filtered node 6 out for visibility, but a link to it remains —
    // and one from it, too.
    response.links.push({ parent_id: 1, child_id: 6, position: 3 });
    response.links.push({ parent_id: 6, child_id: 3, position: 0 });
    const tree = buildTreeFromGraph(response);
    expect(tree.childrenOf(1).map((e) => e.id)).toEqual([2, 4, 5]);
    expect(tree.parentsOf(3).map((e) => e.id)).toEqual([2]);
    expect(tree.parentCount.get(3)).toBe(1);
    expect(tree.parentCount.get(6)).toBeUndefined();
  });
});
