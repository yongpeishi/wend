import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { CreateEntryParams, Entry, EntriesQuery, EntryDetailResponse, EntryTree, UpdateEntryParams } from './types';

function entriesQueryParams(query?: EntriesQuery): Record<string, string | number | boolean | undefined> {
  return { ...query };
}

export function useEntries(query?: EntriesQuery, options?: Partial<UseQueryOptions<Entry[]>>) {
  return useQuery({
    queryKey: queryKeys.entries.list(query),
    queryFn: () => api.get<{ entries: Entry[] }>('/entries', { params: entriesQueryParams(query) }).then((r) => r.entries),
    ...options,
  });
}

/**
 * Returns { entry, parents, children, todos, votes } — see the
 * EntryDetailResponse doc comment for why these are siblings, not a merge.
 */
export function useEntry(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.entries.detail(id ?? -1),
    queryFn: () => api.get<EntryDetailResponse>(`/entries/${id}`),
    enabled: id !== undefined,
  });
}

export function useEntryTree(id: number | undefined, depth = 3) {
  return useQuery({
    queryKey: queryKeys.entries.tree(id ?? -1, depth),
    queryFn: () => api.get<EntryTree>(`/entries/${id}/tree`, { params: { depth } }),
    enabled: id !== undefined,
  });
}

function useInvalidateEntries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
}

export function useCreateEntry() {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: (params: CreateEntryParams) => api.post<{ entry: Entry }>('/entries', params).then((r) => r.entry),
    onSuccess: invalidate,
  });
}

export function useUpdateEntry(id: number) {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: (params: UpdateEntryParams) => api.patch<{ entry: Entry }>(`/entries/${id}`, params).then((r) => r.entry),
    onSuccess: invalidate,
  });
}

export function useArchiveEntry() {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ entry: Entry }>(`/entries/${id}`).then((r) => r.entry),
    onSuccess: invalidate,
  });
}

export function useRestoreEntry() {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: (id: number) => api.post<{ entry: Entry }>(`/entries/${id}/restore`).then((r) => r.entry),
    onSuccess: invalidate,
  });
}

/** Converts an idea into a `kind: "trip"` entry, detaching it from current parents. */
export function useLiftEntry() {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: (id: number) => api.post<{ entry: Entry }>(`/entries/${id}/lift`).then((r) => r.entry),
    onSuccess: invalidate,
  });
}

/** Folds trip `id` into trip `intoId` — `id` becomes an idea, gains `intoId` as a parent. */
export function useAbsorbEntry() {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: ({ id, intoId }: { id: number; intoId: number }) =>
      api.post<{ entry: Entry }>(`/entries/${id}/absorb`, { into_id: intoId }).then((r) => r.entry),
    onSuccess: invalidate,
  });
}

/** Shallow-duplicates a bundle: new bundle, same children linked. */
export function useForkEntry() {
  const invalidate = useInvalidateEntries();
  return useMutation({
    mutationFn: (id: number) => api.post<{ entry: Entry }>(`/entries/${id}/fork`).then((r) => r.entry),
    onSuccess: invalidate,
  });
}
