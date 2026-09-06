import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import {
  LINK_MUTATION_KEY,
  optimisticAddChild,
  optimisticRemoveChild,
  restoreLinkSnapshot,
  settleLinkMutation,
} from '../../api/linkCache';
import type { LinkSnapshot } from '../../api/linkCache';
import type { EntryLink } from '../../api/types';

/**
 * `useCreateLink`/`useDeleteLink` in src/api/links.ts fix the parent id at hook
 * call time, which is right for a detail screen but not here: the planning
 * board adds/removes links against whichever bundle a drag or menu click
 * targets, decided at call time, not render time. This wraps the same two
 * endpoints those hooks call with a dynamic parent id instead of introducing
 * a second parent-id shape into src/api.
 *
 * Both are optimistic (src/api/linkCache.ts): the member shows up in — or
 * leaves — the plan on `mutate`, and a failure puts the snapshot back.
 * `onSettled` is the same `settleLinkMutation` src/api/links.ts uses: with
 * several link mutations in flight (a bulk add, a fast second drop), every
 * settle marks `['entries']` stale but only the last one refetches, otherwise
 * the first response back would repaint the board without the siblings the
 * server hasn't seen yet. No toasts here — every
 * caller (TripBoard, IdeaRow, BulkBar, the map views) already shows its own
 * "That didn't save…" and success toasts per call, so one here would double
 * them.
 */
export function useLinkMutations() {
  const queryClient = useQueryClient();
  const lifecycle = {
    onError: (_error: unknown, _variables: unknown, context: LinkSnapshot | undefined) => {
      if (context) restoreLinkSnapshot(queryClient, context);
    },
    onSettled: () => settleLinkMutation(queryClient),
  };

  const addLink = useMutation({
    mutationKey: [...LINK_MUTATION_KEY, 'add'],
    mutationFn: ({ parentId, childId }: { parentId: number; childId: number }) =>
      api.post<{ link: EntryLink }>(`/entries/${parentId}/links`, { child_id: childId }).then((r) => r.link),
    onMutate: ({ parentId, childId }) => optimisticAddChild(queryClient, parentId, childId),
    ...lifecycle,
  });

  const removeLink = useMutation({
    mutationKey: [...LINK_MUTATION_KEY, 'remove'],
    mutationFn: ({ parentId, childId }: { parentId: number; childId: number }) =>
      api.delete<void>(`/entries/${parentId}/links/${childId}`),
    onMutate: ({ parentId, childId }) => optimisticRemoveChild(queryClient, parentId, childId),
    ...lifecycle,
  });

  return { addLink, removeLink };
}
