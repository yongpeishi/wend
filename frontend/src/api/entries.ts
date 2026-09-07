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
  EntryKind,
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
 *
 * `droppedItemCount` is ideas coming back to "Not placed yet", not placements
 * destroyed — see DroppedDaysBody.
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

// ---- Deleting for good ---------------------------------------------------
// A different route from `DELETE /entries/:id`, which still archives and always
// will. Two verbs, two URLs, so no stray param can turn "set aside" into
// "destroyed" and the server log says plainly which one happened. The server
// enforces the order as well: it refuses anything that is not already
// archived, so the reversible first step is a contract, not a UI convention.

/**
 * What the refusal tells you about the thing you are about to destroy.
 *
 * camelCase here, snake_case on the wire — the boundary is this file, the same
 * as `ChangeTripDatesResult` above.
 *
 * The counts are of what GOES, not of what exists: `votesCount`/`todosCount`
 * are the target's plus those of every descendant that will actually be
 * destroyed. And the three descendant counts are three different fates —
 * destroyed with it, surviving because they also live elsewhere, and left
 * behind because somebody else wrote them and you have no authority over
 * them. The modal states all three, so the split is never a surprise.
 *
 * `tripTitles` is EVERY trip ancestor the caller can see, not "the other
 * trips": the server has no idea which trip screen the request came from, so
 * filtering out the current one is the modal's job.
 */
export interface DeleteForGoodPreview {
  title: string;
  kind: EntryKind;
  votesCount: number;
  todosCount: number;
  tripTitles: string[];
  descendantsDestroyedCount: number;
  descendantsSurvivingCount: number;
  descendantsLeftBehindCount: number;
}

/**
 * `needs_confirmation` is a refusal, not a failure — NOTHING has been
 * destroyed when it arrives. Exactly the idiom `ChangeTripDatesResult` uses:
 * there is no preview endpoint, the attempt is its own preview, and the same
 * call sent again with `confirm: true` is the answer. One code path, so what
 * the modal promises can never drift from what the destroy does.
 */
export type DeleteForGoodResult =
  | { status: 'needs_confirmation'; preview: DeleteForGoodPreview }
  | { status: 'deleted' };

/** The 422 body, snake_case, exactly as the server sends it. */
interface PermanentDeletionBody {
  error: 'permanent_deletion_needs_confirmation';
  preview: {
    title: string;
    kind: EntryKind;
    votes_count: number;
    todos_count: number;
    trip_titles: string[];
    descendants_destroyed_count: number;
    descendants_surviving_count: number;
    descendants_left_behind_count: number;
  };
}

function isPermanentDeletionBody(body: unknown): body is PermanentDeletionBody {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { error?: unknown }).error === 'permanent_deletion_needs_confirmation' &&
    typeof (body as { preview?: unknown }).preview === 'object' &&
    (body as { preview?: unknown }).preview !== null
  );
}

/**
 * Stated with `fetch` rather than through `api.delete`, for the same reason
 * `patchTripDates` above is: the shared client flattens every error body into
 * an `ApiError` carrying a message and throws away the rest — and the rest is
 * the seven counts this modal is made of. The same fix applies to both (an
 * error type that keeps its body, in src/api/client.ts), at which point this
 * becomes `api.delete` again.
 *
 * `must_be_set_aside_first` deliberately falls through to the throw. It is not
 * a state this UI renders: the verb only exists on already-archived things, so
 * seeing it means the client sent a request it should never have sent, and a
 * thrown error is how that reaches someone.
 */
async function deleteEntryPermanently(id: number, confirm?: boolean): Promise<DeleteForGoodResult> {
  const query = confirm === true ? '?confirm_permanent=true' : '';
  const response = await fetch(`/api/entries/${id}/permanent${query}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  const body: unknown = (response.headers.get('content-type') ?? '').includes('application/json')
    ? await response.json()
    : undefined;

  if (isPermanentDeletionBody(body)) {
    const p = body.preview;
    return {
      status: 'needs_confirmation',
      preview: {
        title: p.title,
        kind: p.kind,
        votesCount: p.votes_count,
        todosCount: p.todos_count,
        tripTitles: p.trip_titles,
        descendantsDestroyedCount: p.descendants_destroyed_count,
        descendantsSurvivingCount: p.descendants_surviving_count,
        descendantsLeftBehindCount: p.descendants_left_behind_count,
      },
    };
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : response.statusText || `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  // 204, no body. The row is gone.
  return { status: 'deleted' };
}

/**
 * Destroy an entry, and the things inside it that live nowhere else.
 *
 * Unlike `useArchiveEntry` this invalidates all three caches: a destroyed
 * entry takes its placements with it, so the itinerary and the schedule are
 * both stale, not just the entry lists. Nothing is invalidated on the refusal
 * — no write happened.
 */
export function useDeleteEntryForGood() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirm }: { id: number; confirm?: boolean }) => deleteEntryPermanently(id, confirm),
    onSuccess: (result) => {
      if (result.status !== 'deleted') return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
    },
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
