import type { Entry, EntryGraphResponse } from '../../api/types';

/**
 * Indexed lookups over a GET /entries/:id/graph response. Pure and immutable:
 * build once per response, read many times.
 *
 * Traversal safety: these lookups do NOT detect cycles. The backend rejects
 * cyclic links and caps depth, so a well-formed response cannot loop — but a
 * consumer walking `childrenOf` recursively must still keep its own
 * visited-path check as the guard (a node with several parents is reached
 * more than once even in a perfectly valid DAG).
 */
export interface GraphTree {
  /** The graph's root — `response.entry`. */
  root: Entry;
  /** Every visible node, root included. */
  entryById: Map<number, Entry>;
  /** Direct children of `id` in link `position` order. [] for a leaf or an unknown id. */
  childrenOf(id: number): Entry[];
  /** Direct parents of `id` within the graph. [] for the root or an unknown id. */
  parentsOf(id: number): Entry[];
  /**
   * How many parents each node has WITHIN this graph — what the "also under"
   * chips read. Absent from the map = zero.
   */
  parentCount: Map<number, number>;
}

const EMPTY: Entry[] = [];

export function buildTreeFromGraph(response: EntryGraphResponse): GraphTree {
  const entryById = new Map<number, Entry>([[response.entry.id, response.entry]]);
  for (const entry of response.entries) entryById.set(entry.id, entry);

  // Sorting by (parent_id, position) up front means a plain push builds each
  // parent's children already in position order, whatever order the wire used.
  const links = response.links
    .slice()
    .sort((a, b) => a.parent_id - b.parent_id || a.position - b.position);

  const childrenByParent = new Map<number, Entry[]>();
  const parentsByChild = new Map<number, Entry[]>();
  const parentCount = new Map<number, number>();

  for (const link of links) {
    const parent = entryById.get(link.parent_id);
    const child = entryById.get(link.child_id);
    // A link may point at an id the server filtered out of `entries`
    // (visibility) — a dangling edge is skipped, not an error.
    if (!parent || !child) continue;

    const children = childrenByParent.get(link.parent_id);
    if (children) children.push(child);
    else childrenByParent.set(link.parent_id, [child]);

    const parents = parentsByChild.get(link.child_id);
    if (parents) parents.push(parent);
    else parentsByChild.set(link.child_id, [parent]);

    parentCount.set(link.child_id, (parentCount.get(link.child_id) ?? 0) + 1);
  }

  return {
    root: response.entry,
    entryById,
    childrenOf: (id: number) => childrenByParent.get(id) ?? EMPTY,
    parentsOf: (id: number) => parentsByChild.get(id) ?? EMPTY,
    parentCount,
  };
}
