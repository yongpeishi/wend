import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { Vote, VoteTally } from './types';

function useInvalidateEntries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
}

/** PUT /api/entries/:id/vote — score 0 is a valid "meh", distinct from no vote. */
export function useVote(entryId: number) {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: (score: -2 | -1 | 0 | 1 | 2) =>
      api.put<{ vote: Vote; tally: VoteTally }>(`/entries/${entryId}/vote`, { score }),
    onSuccess: invalidate,
  });
}

/** DELETE /api/entries/:id/vote — withdraws the current user's vote entirely. */
export function useDeleteVote(entryId: number) {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: () => api.delete<void>(`/entries/${entryId}/vote`),
    onSuccess: invalidate,
  });
}
