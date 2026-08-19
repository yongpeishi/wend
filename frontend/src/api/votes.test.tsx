import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { api } from './client';
import { queryKeys } from './queryKeys';
import { useEntries } from './entries';
import { useDeleteVote, useVote } from './votes';
import type { Entry, EntryDetailResponse, EntryTree, VoteTally } from './types';
import { server } from '../mocks/server';
import { db, voteTallyFor } from '../mocks/db';

// The seam against the MSW handlers. What is worth testing here is the cache
// contract: your own vote shows the instant you cast it, in EVERY shape cached
// under the `entries` key, and the server's tally replaces the guess when the
// response lands. The detail and tree caches are primed with `fetchQuery` and
// left unmounted on purpose — an inactive query is not refetched by the
// invalidation in `onSettled`, so whatever they hold at the end was written by
// the optimistic path itself and not by a round trip that hid a missing write.

const TRIP = 1;
const ENTRY = 2; // Nanzen-ji: the demo user has voted 2 on it, Sarah -1.
const DEMO = 1;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** A promise the test opens by hand, so a request can be held mid-flight. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

async function primeCaches(queryClient: QueryClient) {
  await queryClient.fetchQuery({
    queryKey: queryKeys.entries.detail(TRIP),
    queryFn: () => api.get<EntryDetailResponse>(`/entries/${TRIP}`),
  });
  await queryClient.fetchQuery({
    queryKey: queryKeys.entries.tree(TRIP, 3),
    queryFn: () => api.get<EntryTree>(`/entries/${TRIP}/tree`, { params: { depth: 3 } }),
  });
}

const inList = (queryClient: QueryClient) =>
  queryClient.getQueryData<Entry[]>(queryKeys.entries.list())?.find((e) => e.id === ENTRY);
const inDetail = (queryClient: QueryClient) =>
  queryClient.getQueryData<EntryDetailResponse>(queryKeys.entries.detail(TRIP))?.children.find((e) => e.id === ENTRY);
const inTree = (queryClient: QueryClient) =>
  queryClient.getQueryData<EntryTree>(queryKeys.entries.tree(TRIP, 3))?.descendants.find((e) => e.id === ENTRY);

/** The list query, mounted, plus the vote hooks under test. */
function useBoard() {
  return { entries: useEntries(), vote: useVote(ENTRY), unvote: useDeleteVote(ENTRY) };
}

beforeEach(() => {
  db.currentUserId = DEMO;
});

describe('useVote', () => {
  it('writes my_vote into every cached shape before the request resolves, then the server tally', async () => {
    const { opened, open } = gate();
    const tally: VoteTally = {
      total: -3,
      count: 2,
      average: -1.5,
      by_user: { '1': -2, '2': -1 },
      voters: [
        { user_id: 1, user_name: 'Demo Traveler', score: -2 },
        { user_id: 2, user_name: 'Sarah', score: -1 },
      ],
    };
    server.use(
      http.put('/api/entries/:id/vote', async () => {
        await opened;
        return HttpResponse.json({
          vote: { id: 99, entry_id: ENTRY, user_id: DEMO, user_name: 'Demo Traveler', score: -2 },
          tally,
        });
      }),
    );

    const { queryClient, wrapper } = setup();
    const { result } = renderHook(useBoard, { wrapper });
    await waitFor(() => expect(result.current.entries.isSuccess).toBe(true));
    await primeCaches(queryClient);
    expect(inList(queryClient)?.my_vote).toBe(2);

    result.current.vote.mutate(-2);

    // Still in flight — this is the whole point of the optimistic write.
    await waitFor(() => expect(inList(queryClient)?.my_vote).toBe(-2));
    expect(result.current.vote.isPending).toBe(true);
    expect(inDetail(queryClient)?.my_vote).toBe(-2);
    expect(inTree(queryClient)?.my_vote).toBe(-2);
    // The guess is my_vote only: the tally is the server's to state.
    expect(inTree(queryClient)?.vote_tally.total).toBe(1);

    open();
    await waitFor(() => expect(result.current.vote.isSuccess).toBe(true));
    expect(inDetail(queryClient)?.vote_tally).toEqual(tally);
    expect(inTree(queryClient)?.vote_tally).toEqual(tally);
  });

  it('leaves the cache holding the real tally, voters and all', async () => {
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(useBoard, { wrapper });
    await waitFor(() => expect(result.current.entries.isSuccess).toBe(true));
    await primeCaches(queryClient);

    result.current.vote.mutate(-2);
    await waitFor(() => expect(result.current.vote.isSuccess).toBe(true));

    expect(inList(queryClient)?.my_vote).toBe(-2);
    expect(inTree(queryClient)?.vote_tally).toEqual({
      total: -3,
      count: 2,
      average: -1.5,
      by_user: { '1': -2, '2': -1 },
      voters: [
        { user_id: 1, user_name: 'Demo Traveler', score: -2 },
        { user_id: 2, user_name: 'Sarah', score: -1 },
      ],
    });
  });

  it('puts the previous vote back when the write fails', async () => {
    server.use(http.put('/api/entries/:id/vote', () => HttpResponse.json({ error: 'Nope' }, { status: 500 })));

    const { queryClient, wrapper } = setup();
    const { result } = renderHook(useBoard, { wrapper });
    await waitFor(() => expect(result.current.entries.isSuccess).toBe(true));
    await primeCaches(queryClient);

    result.current.vote.mutate(-2);
    await waitFor(() => expect(result.current.vote.isError).toBe(true));

    expect(inList(queryClient)?.my_vote).toBe(2);
    expect(inDetail(queryClient)?.my_vote).toBe(2);
    expect(inTree(queryClient)?.my_vote).toBe(2);
    // A rolled-back guess is exactly when a refetch is worth most.
    expect(queryClient.getQueryState(queryKeys.entries.detail(TRIP))?.isInvalidated).toBe(true);
  });

  it('leaves a cached shape it does not recognise alone', async () => {
    const { queryClient, wrapper } = setup();
    const odd = ['entries', 'summary', 'something-else'] as const;
    queryClient.setQueryData(odd, { headline: 'nothing entry-shaped here' });

    const { result } = renderHook(useBoard, { wrapper });
    await waitFor(() => expect(result.current.entries.isSuccess).toBe(true));

    result.current.vote.mutate(1);
    await waitFor(() => expect(result.current.vote.isSuccess).toBe(true));
    expect(queryClient.getQueryData(odd)).toEqual({ headline: 'nothing entry-shaped here' });
  });
});

describe('useDeleteVote', () => {
  it('clears my_vote before the request resolves', async () => {
    const { opened, open } = gate();
    server.use(
      http.delete('/api/entries/:id/vote', async () => {
        await opened;
        db.votes = db.votes.filter((v) => !(v.entry_id === ENTRY && v.user_id === DEMO));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { queryClient, wrapper } = setup();
    const { result } = renderHook(useBoard, { wrapper });
    await waitFor(() => expect(result.current.entries.isSuccess).toBe(true));
    await primeCaches(queryClient);

    result.current.unvote.mutate();

    await waitFor(() => expect(inList(queryClient)?.my_vote).toBeNull());
    expect(result.current.unvote.isPending).toBe(true);
    expect(inDetail(queryClient)?.my_vote).toBeNull();
    expect(inTree(queryClient)?.my_vote).toBeNull();

    open();
    await waitFor(() => expect(result.current.unvote.isSuccess).toBe(true));
    // 204 carries no tally, so the totals only correct on the refetch that
    // follows — the active list query has it, the unmounted tree has not.
    expect(inList(queryClient)?.vote_tally.count).toBe(1);
  });
});

describe('voteTallyFor', () => {
  it('lists the voters with their names, ordered by user_id', () => {
    expect(voteTallyFor(ENTRY).voters).toEqual([
      { user_id: 1, user_name: 'Demo Traveler', score: 2 },
      { user_id: 2, user_name: 'Sarah', score: -1 },
    ]);
  });

  it('orders by user_id even when the votes were cast the other way round', () => {
    db.votes = db.votes.filter((v) => v.entry_id !== ENTRY);
    db.votes.push({ id: 501, entry_id: ENTRY, user_id: 2, user_name: 'Sarah', score: 1 });
    db.votes.push({ id: 502, entry_id: ENTRY, user_id: 1, user_name: 'Demo Traveler', score: -2 });

    const tally = voteTallyFor(ENTRY);
    expect(tally.voters?.map((v) => v.user_id)).toEqual([1, 2]);
    expect(tally.by_user).toEqual({ '1': -2, '2': 1 });
    expect(tally.count).toBe(2);
  });

  it('has an empty voters list when nobody has voted', () => {
    expect(voteTallyFor(4).voters).toEqual([]);
  });
});
