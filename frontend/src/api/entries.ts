import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { api, ApiError } from './client';
import { queryKeys } from './queryKeys';
import type {
  CreateEntryParams,
  DroppedDaysBody,
  Entry,
  EntriesQuery,
  EntryDetailResponse,
  EntryTree,
  UpdateEntryParams,
} from './types';

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

// ---- A trip's dates ------------------------------------------------------
// Its own seam, on the same PATCH the rest of the entry uses, because moving a
// trip's dates is not an edit to one field: the whole plan moves with them.

/**
 * What a date change came back as.
 *
 * `dropped_days` is a refusal, not a failure — NOTHING has been written when
 * it arrives. There is deliberately no preview endpoint: the attempt is the
 * preview, and the same call sent again with `confirm: true` is the answer.
 */
export type ChangeTripDatesResult =
  | { status: 'saved'; entry: Entry }
  | { status: 'dropped_days'; droppedDays: string[]; droppedItemCount: number };

export interface ChangeTripDatesParams {
  startsOn: string;
  endsOn: string;
  /** Second time round, once the user has agreed to lose those days. */
  confirm?: boolean;
}

function isDroppedDaysBody(body: unknown): body is DroppedDaysBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { error?: unknown }).error === 'dropped_days_need_confirmation' &&
    Array.isArray((body as { dropped_days?: unknown }).dropped_days)
  );
}

/**
 * Stated with `fetch` rather than through `api.patch`, and only because of the
 * 422: the shared client turns every error body into an `ApiError` carrying a
 * message, which is the right shape for every other call on this seam but
 * throws away the two facts this modal is made of — which days, and how many
 * things on them. Worth folding back into src/api/client.ts as an error that
 * keeps its body, at which point this becomes `api.patch` again.
 */
async function patchTripDates(id: number, params: ChangeTripDatesParams): Promise<ChangeTripDatesResult> {
  const response = await fetch(`/api/entries/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entry: { starts_on: params.startsOn, ends_on: params.endsOn },
      confirm_dropped_days: params.confirm === true,
    }),
  });

  const body: unknown = (response.headers.get('content-type') ?? '').includes('application/json')
    ? await response.json()
    : undefined;

  if (isDroppedDaysBody(body)) {
    return {
      status: 'dropped_days',
      droppedDays: body.dropped_days,
      droppedItemCount: body.dropped_item_count ?? 0,
    };
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : response.statusText || `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return { status: 'saved', entry: (body as { entry: Entry }).entry };
}

/**
 * Move a trip's dates, carrying its plan along.
 *
 * Every trip day and every placed thing shifts by the same delta, so Day 2 is
 * still Day 2 on its new date. That makes this an itinerary write as much as an
 * entry one, which is why it invalidates all three caches rather than only the
 * entries the plain `useUpdateEntry` touches.
 */
export function useChangeTripDates(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: ChangeTripDatesParams) => patchTripDates(id, params),
    onSuccess: (result) => {
      if (result.status !== 'saved') return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    },
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
