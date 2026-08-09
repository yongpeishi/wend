import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, queryKeys } from '../../api';
import type { EntryLink } from '../../api/types';

/**
 * `useCreateLink`/`useDeleteLink` in src/api/links.ts fix the parent id at hook
 * call time, which is right for a detail screen but not here: the planning
 * board adds/removes links against whichever bundle a drag or menu click
 * targets, decided at call time, not render time. This wraps the same two
 * endpoints those hooks call with a dynamic parent id instead of introducing
 * a second parent-id shape into src/api.
 */
export function useLinkMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });

  const addLink = useMutation({
    mutationFn: ({ parentId, childId }: { parentId: number; childId: number }) =>
      api.post<{ link: EntryLink }>(`/entries/${parentId}/links`, { child_id: childId }).then((r) => r.link),
    onSuccess: invalidate,
  });

  const removeLink = useMutation({
    mutationFn: ({ parentId, childId }: { parentId: number; childId: number }) =>
      api.delete<void>(`/entries/${parentId}/links/${childId}`),
    onSuccess: invalidate,
  });

  return { addLink, removeLink };
}
