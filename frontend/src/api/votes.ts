import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { Entry, Vote, VoteTally } from './types';

// Your own vote lands the moment you cast it; everyone else's arrives on the
// next render that refetches. So the cache is written twice: once from the
// click (`my_vote`, optimistic) and once from the response (`vote_tally`,
// authoritative — it is why the PUT answers with a tally at all). A DELETE
// answers 204 with no body, so it only gets the first write and lets the
// invalidation that follows correct the tally.

/** Every cached `['entries', …]` payload, as `getQueriesData` hands it over. */
type EntriesSnapshot = [QueryKey, unknown][];

function isEntry(value: unknown): value is Entry {
  return typeof value === 'object' && value !== null && typeof (value as Entry).id === 'number' && 'vote_tally' in value;
}

/**
 * Apply `patch` to entry `entryId` wherever it sits inside ONE cached payload.
 *
 * Several shapes live under the `entries` key — `list` is `Entry[]`, `detail`
 * is `{ entry, children, … }`, `tree` is `{ entry, descendants }` — and a query
 * that has not resolved holds `undefined`. Anything this does not recognise is
 * handed straight back: an unexpected shape must leave the cache as it found
 * it, never throw, because this runs across every entries query at once.
 * Unchanged payloads are returned by identity so React Query skips the
 * notification.
 */
function patchEntry(data: unknown, entryId: number, patch: (entry: Entry) => Entry): unknown {
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((item) => {
      if (!isEntry(item) || item.id !== entryId) return item;
      changed = true;
      return patch(item);
    });
    return changed ? next : data;
  }

  if (isEntry(data)) return data.id === entryId ? patch(data) : data;
  if (typeof data !== 'object' || data === null) return data;

  const record = data as Record<string, unknown>;
  let changed = false;
  const next = { ...record };
  // `parents` is deliberately absent: those are EntrySummary, which carries no
  // vote of its own. `isEntry` would skip them anyway.
  for (const key of ['entry', 'children', 'descendants'] as const) {
    if (!(key in record)) continue;
    const updated = patchEntry(record[key], entryId, patch);
    if (updated === record[key]) continue;
    next[key] = updated;
    changed = true;
  }
  return changed ? next : data;
}

/** The three cache moves both hooks make, bound to one entry. */
function useEntriesCache(entryId: number) {
  const queryClient = useQueryClient();

  return {
    /** Stop in-flight refetches from landing on top of the optimistic write. */
    async cancelAndSnapshot(): Promise<EntriesSnapshot> {
      await queryClient.cancelQueries({ queryKey: queryKeys.entries.all });
      return queryClient.getQueriesData({ queryKey: queryKeys.entries.all });
    },
    patch(patch: (entry: Entry) => Entry) {
      queryClient.setQueriesData({ queryKey: queryKeys.entries.all }, (data: unknown) => patchEntry(data, entryId, patch));
    },
    restore(snapshot: EntriesSnapshot | undefined) {
      for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data);
    },
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.entries.all }),
  };
}

/** PUT /api/entries/:id/vote — score 0 is a valid "meh", distinct from no vote. */
export function useVote(entryId: number) {
  const cache = useEntriesCache(entryId);
  return useMutation({
    mutationFn: (score: -2 | -1 | 0 | 1 | 2) =>
      api.put<{ vote: Vote; tally: VoteTally }>(`/entries/${entryId}/vote`, { score }),
    onMutate: async (score) => {
      const previous = await cache.cancelAndSnapshot();
      cache.patch((entry) => ({ ...entry, my_vote: score }));
      return { previous };
    },
    onSuccess: ({ tally }) => {
      cache.patch((entry) => ({ ...entry, vote_tally: tally }));
    },
    onError: (_error, _score, context) => cache.restore(context?.previous),
    // Not onSuccess: a failed write leaves the cache holding a rolled-back
    // guess, which is exactly when a refetch is worth most.
    onSettled: () => cache.invalidate(),
  });
}

/** DELETE /api/entries/:id/vote — withdraws the current user's vote entirely. */
export function useDeleteVote(entryId: number) {
  const cache = useEntriesCache(entryId);
  return useMutation({
    mutationFn: () => api.delete<void>(`/entries/${entryId}/vote`),
    onMutate: async () => {
      const previous = await cache.cancelAndSnapshot();
      cache.patch((entry) => ({ ...entry, my_vote: null }));
      return { previous };
    },
    // No onSuccess tally: 204 carries no body, so the totals stay one render
    // stale until the invalidation below brings them back.
    onError: (_error, _variables, context) => cache.restore(context?.previous),
    onSettled: () => cache.invalidate(),
  });
}
