import { useMemo } from 'react';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { api } from './client';
import {
  LINK_MUTATION_KEY,
  linkTouch,
  optimisticAddChild,
  optimisticRemoveChild,
  optimisticReorderChildren,
  restoreLinkSnapshot,
  settleLinkMutation,
} from './linkCache';
import type { LinkSnapshot } from './linkCache';
import type { EntryLink } from './types';

/**
 * The `onError`/`onSettled` pair every link mutation shares. Each hook edits
 * the cache in `onMutate` (see src/api/linkCache.ts) and hands back a snapshot
 * as its context; a failure puts the snapshot back, and settling marks
 * `['entries']` stale — refetching only from the last mutation standing, so
 * an earlier response cannot repaint the board without the siblings still in
 * flight (see `settleLinkMutation`).
 *
 * No toasts here. Every caller already shows "That didn't save. It's still
 * here — try again." from its own per-call `onError`, and success toasts are
 * the caller's too (a bulk add says how many; a drop says which plan). A
 * toast at this layer would double every one of them.
 */
function linkMutationLifecycle(queryClient: QueryClient) {
  return {
    onError: (_error: unknown, _variables: unknown, context: LinkSnapshot | undefined) => {
      if (context) restoreLinkSnapshot(queryClient, context);
    },
    onSettled: () => settleLinkMutation(queryClient),
  };
}

export function useCreateLink(parentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...LINK_MUTATION_KEY, 'create', parentId],
    mutationFn: (params: { child_id: number; position?: number }) =>
      api.post<{ link: EntryLink }>(`/entries/${parentId}/links`, params).then((r) => r.link),
    onMutate: ({ child_id, position }) => optimisticAddChild(queryClient, parentId, child_id, position),
    ...linkMutationLifecycle(queryClient),
  });
}

export function useDeleteLink(parentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [...LINK_MUTATION_KEY, 'delete', parentId],
    mutationFn: (childId: number) => api.delete<void>(`/entries/${parentId}/links/${childId}`),
    onMutate: (childId) => optimisticRemoveChild(queryClient, parentId, childId),
    ...linkMutationLifecycle(queryClient),
  });
}

/**
 * Reorders every child of `parentId` at once — pass the full ordered id list.
 * `movedId` is the one row the user actually dragged; it is not sent, it only
 * tells `usePendingLinkChildIds` which row to fade while the save is out
 * (fading the whole plan for a one-row move would read as a freeze).
 */
export function useReorderLinks(parentId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ childIds }: { childIds: number[]; movedId?: number }) =>
      api.post<{ links: EntryLink[] }>(`/entries/${parentId}/links/reorder`, { child_ids: childIds }).then((r) => r.links),
    mutationKey: [...LINK_MUTATION_KEY, 'reorder', parentId],
    onMutate: ({ childIds }) => optimisticReorderChildren(queryClient, parentId, childIds),
    ...linkMutationLifecycle(queryClient),
  });
}

const NO_IDS: ReadonlySet<number> = new Set();

/**
 * Child ids of `parentId` with a link mutation in flight — the rows to fade.
 *
 * Derived from the mutation cache rather than from local state so that every
 * surface that can start a link mutation (board drop, idea-row menu, bulk
 * bar, map) fades the same row in the same plan without knowing about each
 * other. The Set keeps its identity while its contents are unchanged, so a
 * BundleCard can hang memos and effects off it.
 */
export function usePendingLinkChildIds(parentId: number): ReadonlySet<number> {
  const touches = useMutationState({
    filters: { mutationKey: LINK_MUTATION_KEY, status: 'pending' },
    select: (mutation) => linkTouch(mutation.options.mutationKey, mutation.state.variables),
  });

  // The sorted, joined ids are the Set's identity: memoising on that string
  // (and rebuilding the Set from it) keeps the same instance across the
  // re-renders `useMutationState` causes while nothing relevant changed.
  const signature = touches
    .filter((touch) => touch?.parentId === parentId)
    .flatMap((touch) => touch?.childIds ?? [])
    .sort((a, b) => a - b)
    .join(',');

  return useMemo(() => (signature ? new Set(signature.split(',').map(Number)) : NO_IDS), [signature]);
}
