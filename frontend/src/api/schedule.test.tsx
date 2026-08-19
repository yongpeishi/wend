import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from './client';
import { queryKeys } from './queryKeys';
import { useEntryGraph } from './entries';
import { useCreateScheduleItem, useDeleteScheduleItem } from './schedule';
import type { Entry } from './types';
import { db } from '../mocks/db';

// The seam against the MSW handlers, in the todos.test.tsx mould. `scheduled`
// is a field on `Entry` computed by the server from schedule items, so placing
// or removing an item changes data the *entries* queries own — the Structure
// tree's dot and the BundleCard member dots both read it from the graph query.
// A schedule mutation that invalidates only schedule/itinerary keys leaves that
// dot stale until a reload. Each mutation is checked twice — once on the
// mounted graph, which refetches and must come back with the new flag (what a
// user sees), and once on an unmounted list query, which is not refetched and
// so can only show that it was marked invalidated.

const TRIP = 1;
const KIYAMACHI = 3; // The seed keeps it out of every live version: unscheduled.
const TERAMACHI = 8; // Placed once, in day 2's live "Version A".
const DEMO = 1;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** Left unmounted on purpose: an inactive query is marked, never refetched. */
async function primeList(queryClient: QueryClient) {
  await queryClient.fetchQuery({
    queryKey: queryKeys.entries.list(),
    queryFn: () => api.get<{ entries: Entry[] }>('/entries'),
  });
}

const listInvalidated = (queryClient: QueryClient) =>
  queryClient.getQueryState(queryKeys.entries.list())?.isInvalidated;

/** The Structure panel's reads plus the two placement mutations, on one trip. */
function useBoard() {
  return {
    graph: useEntryGraph(TRIP, { tripId: TRIP }),
    create: useCreateScheduleItem(TRIP),
    remove: useDeleteScheduleItem(),
  };
}

type Board = ReturnType<typeof useBoard>;

const scheduledInGraph = (board: Board, entryId: number) =>
  board.graph.data?.entries.find((e) => e.id === entryId)?.scheduled;

async function mountBoard() {
  const { queryClient, wrapper } = setup();
  const { result } = renderHook(useBoard, { wrapper });
  await waitFor(() => expect(result.current.graph.isSuccess).toBe(true));
  await primeList(queryClient);
  expect(listInvalidated(queryClient)).toBe(false);
  return { queryClient, result };
}

beforeEach(() => {
  db.currentUserId = DEMO;
});

describe('schedule mutations and the entries cache', () => {
  it('refetches the graph after a create, so the scheduled dot appears', async () => {
    const { queryClient, result } = await mountBoard();
    expect(scheduledInGraph(result.current, KIYAMACHI)).toBe(false);

    result.current.create.mutate({ entry_id: KIYAMACHI, day: '2026-11-02' });
    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));

    await waitFor(() => expect(scheduledInGraph(result.current, KIYAMACHI)).toBe(true));
    expect(listInvalidated(queryClient)).toBe(true);
  });

  it('refetches the graph after a delete, so the scheduled dot clears', async () => {
    const { queryClient, result } = await mountBoard();
    expect(scheduledInGraph(result.current, TERAMACHI)).toBe(true);
    const itemId = db.scheduleItems.find((s) => s.entry_id === TERAMACHI)!.id;

    result.current.remove.mutate(itemId);
    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));

    await waitFor(() => expect(scheduledInGraph(result.current, TERAMACHI)).toBe(false));
    expect(listInvalidated(queryClient)).toBe(true);
  });
});
