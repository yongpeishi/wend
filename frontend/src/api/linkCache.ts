import type { MutationKey, QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import type { Entry, EntryDetailResponse } from './types';

/**
 * The prefix every link mutation's `mutationKey` starts with. Two things hang
 * off it: `usePendingLinkChildIds` asks `useMutationState` for everything
 * under this prefix, and each hook's `onSettled` counts how many are still
 * in flight before refetching — see the `isMutating(...) === 1` guard in
 * src/api/links.ts.
 */
export const LINK_MUTATION_KEY = ['links'] as const;

/** What a pending link mutation is touching — for the in-flight fade. */
export interface LinkTouch {
  parentId: number;
  childIds: number[];
}

/**
 * Reads the parent/child ids a link mutation touches off its key and
 * variables, so the fade can be derived from `useMutationState` alone
 * without each caller having to track its own pending set. The key's second
 * segment names the hook; a hook that fixes its parent at hook-call time
 * carries it in the third segment, one that takes the parent per call carries
 * it in the variables. Returns undefined for anything that isn't a link
 * mutation — callers filter, they don't throw.
 */
export function linkTouch(mutationKey: MutationKey | undefined, variables: unknown): LinkTouch | undefined {
  if (!mutationKey || mutationKey[0] !== LINK_MUTATION_KEY[0]) return undefined;
  const staticParent = typeof mutationKey[2] === 'number' ? mutationKey[2] : undefined;
  const vars = (typeof variables === 'object' && variables !== null ? variables : {}) as Record<string, unknown>;

  switch (mutationKey[1]) {
    case 'create':
      if (staticParent === undefined || typeof vars.child_id !== 'number') return undefined;
      return { parentId: staticParent, childIds: [vars.child_id] };
    case 'position':
      if (staticParent === undefined || typeof vars.childId !== 'number') return undefined;
      return { parentId: staticParent, childIds: [vars.childId] };
    case 'delete':
      if (staticParent === undefined || typeof variables !== 'number') return undefined;
      return { parentId: staticParent, childIds: [variables] };
    case 'reorder':
      if (staticParent === undefined) return undefined;
      return { parentId: staticParent, childIds: typeof vars.movedId === 'number' ? [vars.movedId] : [] };
    case 'add':
    case 'remove':
      if (typeof vars.parentId !== 'number' || typeof vars.childId !== 'number') return undefined;
      return { parentId: vars.parentId, childIds: [vars.childId] };
    default:
      return undefined;
  }
}

const LIST_PREFIX: QueryKey = ['entries', 'list'];
const DETAIL_PREFIX: QueryKey = ['entries', 'detail'];

/**
 * Finds an entry anywhere in the cache: its own detail first, then any list,
 * then any other bundle's `children`. An optimistic add needs the full Entry
 * to splice into the parent's `children`, and the board only ever has the
 * child as a list row (ideas list) or as a member of some other bundle — it
 * almost never has the child's detail fetched.
 */
export function findCachedEntry(queryClient: QueryClient, id: number): Entry | undefined {
  const own = queryClient.getQueryData<EntryDetailResponse>(queryKeys.entries.detail(id))?.entry;
  if (own) return own;

  for (const [, list] of queryClient.getQueriesData<Entry[]>({ queryKey: LIST_PREFIX })) {
    const hit = Array.isArray(list) ? list.find((e) => e.id === id) : undefined;
    if (hit) return hit;
  }

  for (const [, detail] of queryClient.getQueriesData<EntryDetailResponse>({ queryKey: DETAIL_PREFIX })) {
    const hit = detail?.children?.find((e) => e.id === id);
    if (hit) return hit;
  }

  return undefined;
}

/**
 * Everything an optimistic link edit touched, as it was before the edit.
 * `lists` is every `['entries','list',…]` query, not just the ones we changed —
 * cheaper to restore wholesale than to work out which rows moved.
 */
export interface LinkSnapshot {
  detail: EntryDetailResponse | undefined;
  lists: [QueryKey, Entry[] | undefined][];
}

/**
 * Cancels the parent's in-flight detail fetch (so a response already on the
 * wire cannot land on top of the optimistic state) and captures what we are
 * about to change. Every `optimistic*` below starts here.
 *
 * Only the detail is cancelled. A list refetch already in flight (kicked off
 * by a sibling that settled a moment ago) can still land after this edit and
 * briefly show the pre-edit `parent_ids`/`children_count` on the ideas list;
 * the plan's `children` — what the board actually draws the move from — are
 * safe, and the list is put right when this mutation settles and refetches.
 * Cancelling every `['entries','list']` query on each drop would also cancel
 * the ideas list's own first load, which nothing would restart until then.
 */
async function snapshot(queryClient: QueryClient, parentId: number): Promise<LinkSnapshot> {
  await queryClient.cancelQueries({ queryKey: queryKeys.entries.detail(parentId) });
  return {
    detail: queryClient.getQueryData<EntryDetailResponse>(queryKeys.entries.detail(parentId)),
    lists: queryClient.getQueriesData<Entry[]>({ queryKey: LIST_PREFIX }),
  };
}

function setChildren(
  queryClient: QueryClient,
  parentId: number,
  update: (children: Entry[]) => Entry[],
): void {
  queryClient.setQueryData<EntryDetailResponse>(queryKeys.entries.detail(parentId), (detail) =>
    detail ? { ...detail, children: update(detail.children) } : detail,
  );
}

/**
 * Applies `update` to every cached entries list. Lists are edited
 * best-effort: the ideas list reads `parent_ids` for its "in plan X" line and
 * the bundle row carries `children_count`, and both should agree with the
 * optimistic membership until the refetch lands.
 */
function updateLists(queryClient: QueryClient, update: (entry: Entry) => Entry): void {
  queryClient.setQueriesData<Entry[]>({ queryKey: LIST_PREFIX }, (list) =>
    Array.isArray(list) ? list.map(update) : list,
  );
}

function linkedInLists(parentId: number, childId: number) {
  return (entry: Entry): Entry => {
    if (entry.id === childId && !entry.parent_ids.includes(parentId)) {
      return { ...entry, parent_ids: [...entry.parent_ids, parentId] };
    }
    if (entry.id === parentId) return { ...entry, children_count: entry.children_count + 1 };
    return entry;
  };
}

function unlinkedInLists(parentId: number, childId: number) {
  return (entry: Entry): Entry => {
    if (entry.id === childId && entry.parent_ids.includes(parentId)) {
      return { ...entry, parent_ids: entry.parent_ids.filter((id) => id !== parentId) };
    }
    if (entry.id === parentId) return { ...entry, children_count: Math.max(0, entry.children_count - 1) };
    return entry;
  };
}

/**
 * Shows `childId` inside `parentId` before the server confirms. Skipped (but
 * still snapshotted, so rollback stays uniform) when the parent's detail
 * isn't cached — nothing on screen to update — when the child can't be found
 * anywhere in the cache, or when it is already a member.
 */
export async function optimisticAddChild(
  queryClient: QueryClient,
  parentId: number,
  childId: number,
  position?: number,
): Promise<LinkSnapshot> {
  const snap = await snapshot(queryClient, parentId);
  if (!snap.detail || snap.detail.children.some((c) => c.id === childId)) return snap;
  const child = findCachedEntry(queryClient, childId);
  if (!child) return snap;

  setChildren(queryClient, parentId, (children) => {
    const next = [...children];
    next.splice(position ?? next.length, 0, child);
    return next;
  });
  updateLists(queryClient, linkedInLists(parentId, childId));
  return snap;
}

/** Drops `childId` from `parentId` before the server confirms. */
export async function optimisticRemoveChild(
  queryClient: QueryClient,
  parentId: number,
  childId: number,
): Promise<LinkSnapshot> {
  const snap = await snapshot(queryClient, parentId);
  if (snap.detail) {
    setChildren(queryClient, parentId, (children) => children.filter((c) => c.id !== childId));
    updateLists(queryClient, unlinkedInLists(parentId, childId));
  }
  return snap;
}

/** Pure: `children` in `childIds` order, with any id not listed keeping its relative order after them. */
export function reorderChildren(children: Entry[], childIds: number[]): Entry[] {
  const rank = new Map(childIds.map((id, index) => [id, index]));
  const listed = children.filter((c) => rank.has(c.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const unlisted = children.filter((c) => !rank.has(c.id));
  return [...listed, ...unlisted];
}

/** Reorders `parentId`'s children to `childIds` before the server confirms. */
export async function optimisticReorderChildren(
  queryClient: QueryClient,
  parentId: number,
  childIds: number[],
): Promise<LinkSnapshot> {
  const snap = await snapshot(queryClient, parentId);
  if (snap.detail) setChildren(queryClient, parentId, (children) => reorderChildren(children, childIds));
  return snap;
}

/** Moves one child of `parentId` to index `position` before the server confirms. */
export async function optimisticMoveChild(
  queryClient: QueryClient,
  parentId: number,
  childId: number,
  position: number,
): Promise<LinkSnapshot> {
  const snap = await snapshot(queryClient, parentId);
  if (snap.detail) {
    setChildren(queryClient, parentId, (children) => {
      const moved = children.find((c) => c.id === childId);
      if (!moved) return children;
      const next = children.filter((c) => c.id !== childId);
      next.splice(Math.max(0, Math.min(position, next.length)), 0, moved);
      return next;
    });
  }
  return snap;
}

/**
 * Puts every cache an `optimistic*` touched back the way it was.
 *
 * "The way it was" is as of THIS mutation's `onMutate`. With several link
 * mutations in flight, a later one's snapshot already contains the earlier
 * ones' optimistic edits, and an earlier one's snapshot predates the later
 * ones'. So a failure in the first of two overlapping drops also hides the
 * second's row until the second settles — at which point it is the last one
 * standing, its `onSettled` invalidates `['entries']`, and the refetch paints
 * the server's truth (see the guard in src/api/links.ts). The alternative —
 * diffing snapshots against the live cache to restore only what this mutation
 * changed — is not worth its weight for a flicker that only shows when a
 * request fails while a sibling is still out.
 *
 * Lists whose data was `undefined` at snapshot time (still on their first
 * fetch) are skipped by `setQueryData` itself, which is a no-op for undefined.
 */
export function restoreLinkSnapshot(queryClient: QueryClient, snap: LinkSnapshot): void {
  if (snap.detail) queryClient.setQueryData(queryKeys.entries.detail(snap.detail.entry.id), snap.detail);
  for (const [key, list] of snap.lists) {
    queryClient.setQueryData(key, list);
  }
}
