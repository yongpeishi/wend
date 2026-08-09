import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { EntryLink } from './types';

function useInvalidateEntries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
}

export function useCreateLink(parentId: number) {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: (params: { child_id: number; position?: number }) =>
      api.post<{ link: EntryLink }>(`/entries/${parentId}/links`, params).then((r) => r.link),
    onSuccess: invalidate,
  });
}

export function useUpdateLinkPosition(parentId: number) {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: ({ childId, position }: { childId: number; position: number }) =>
      api.patch<{ link: EntryLink }>(`/entries/${parentId}/links/${childId}`, { position }).then((r) => r.link),
    onSuccess: invalidate,
  });
}

export function useDeleteLink(parentId: number) {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: (childId: number) => api.delete<void>(`/entries/${parentId}/links/${childId}`),
    onSuccess: invalidate,
  });
}

/** Reorders every child of `parentId` at once — pass the full ordered id list. */
export function useReorderLinks(parentId: number) {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: (childIds: number[]) =>
      api.post<{ links: EntryLink[] }>(`/entries/${parentId}/links/reorder`, { child_ids: childIds }).then((r) => r.links),
    onSuccess: invalidate,
  });
}
