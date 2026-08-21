import type { Entry } from '../../api/types';

/**
 * Pure readings of the idea tree, over `Entry.parent_ids` and nothing else.
 *
 * The board's drill-down is a VIEW of the links, not a second copy of them:
 * every function here takes the flat list of a trip's ideas and answers one
 * question about it, so the container can scope the list without any component
 * below it learning the tree exists — rows receive counts and titles as plain
 * props and never call back in here.
 *
 * Two properties of `parent_ids` shape everything in this file:
 *
 *   - It is NOT filtered by visibility. A bare id reveals nothing usable, so
 *     the serializer ships them all — the trip entry, bundles, ideas on other
 *     trips. Every function therefore intersects against the idea set it was
 *     handed before believing a parent is real. "Has no parent" always means
 *     "has no parent AMONG THESE IDEAS", never "has an empty array".
 *   - Nothing here may assume the links form a tree. They are many-to-many
 *     (an idea can sit inside two others), and the backend does not promise
 *     this mock-era frontend a cycle never slipped in — so the one walk here
 *     (subtreeIdeaIds, which subtreeCount reads its number off) carries a
 *     visited set rather than trusting the data to terminate for it.
 */

/** The ideas that sit directly inside `id` — one level, link order not implied. */
export function ideaChildrenOf(ideas: Entry[], id: number): Entry[] {
  return ideas.filter((entry) => entry.parent_ids.includes(id));
}

/**
 * The top level of the drill-down: ideas with no parent that is itself one of
 * `ideas`. Parents outside the set — the trip entry, a bundle, an idea that
 * was archived away — do not count, or an idea filed only under a bundle
 * would vanish from the board entirely: not root, and not reachable by
 * drilling either.
 */
export function rootIdeas(ideas: Entry[]): Entry[] {
  const ideaIds = new Set(ideas.map((entry) => entry.id));
  return ideas.filter((entry) => !entry.parent_ids.some((parentId) => ideaIds.has(parentId)));
}

/**
 * Every distinct idea anywhere under `id` — the ids the drill-down can reach
 * from it, never including `id` itself.
 *
 * Distinct, because the links are many-to-many: an idea reachable down two
 * branches is still one idea. The visited set is also what makes a cycle safe
 * — a loop is a set of ideas each seen once, not a walk that never ends — and
 * it is why the entry is never its own descendant, even inside a cycle that
 * leads back to it.
 *
 * A Set rather than a list because both callers ask set questions: the row's
 * pill wants the size, and the edit form wants "is this a descendant?" to keep
 * an idea from being filed inside its own subtree.
 */
export function subtreeIdeaIds(ideas: Entry[], id: number): Set<number> {
  const visited = new Set<number>();
  const queue = ideaChildrenOf(ideas, id).map((entry) => entry.id);
  while (queue.length > 0) {
    const nextId = queue.shift();
    if (nextId === undefined || nextId === id || visited.has(nextId)) continue;
    visited.add(nextId);
    for (const child of ideaChildrenOf(ideas, nextId)) queue.push(child.id);
  }
  return visited;
}

/** How many distinct ideas live anywhere under `id` — the "N inside" number. */
export function subtreeCount(ideas: Entry[], id: number): number {
  return subtreeIdeaIds(ideas, id).size;
}

/**
 * The titles of `entry`'s OTHER idea parents — the "also inside …" fact a row
 * shows when an idea belongs to more places than the one you are looking at.
 *
 * `excludeId` is the level currently on screen (null at root, where nothing
 * is implied and every idea parent is news). Only parents in `ideas` are
 * named: the rest are ids the serializer shipped unfiltered, and a title this
 * board cannot resolve is a parent it has no business claiming. Order follows
 * `parent_ids`, which the serializer keeps ascending by id.
 */
export function otherParentTitles(ideas: Entry[], entry: Entry, excludeId: number | null): string[] {
  const byId = new Map(ideas.map((idea) => [idea.id, idea]));
  return entry.parent_ids
    .filter((parentId) => parentId !== excludeId)
    .map((parentId) => byId.get(parentId))
    .filter((parent): parent is Entry => parent !== undefined)
    .map((parent) => parent.title);
}
