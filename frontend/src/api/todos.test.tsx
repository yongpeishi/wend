import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from './client';
import { queryKeys } from './queryKeys';
import { useEntries } from './entries';
import { useCreateTodo, useDeleteTodo, useTodos, useUpdateTodo } from './todos';
import type { Entry, EntryDetailResponse } from './types';
import { db } from '../mocks/db';

// The seam against the MSW handlers. What is worth testing here is the half of
// the cache contract that is invisible from todos.ts: `todos_open_count` is a
// field on `Entry`, so a to-do write changes data the *entries* query owns, and
// a mutation that invalidates only its own key leaves the board's "N open"
// text and state dot stale until a reload. Each mutation is checked twice —
// once on the mounted list, which refetches and must come back with the new
// count (the behaviour a user sees), and once on an unmounted detail query,
// which is not refetched and so can only show that it was marked invalidated.

const TRIP = 1;
const ENTRY = 2; // Nanzen-ji: the seed gives it exactly one open to-do.
const DEMO = 1;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

/** Left unmounted on purpose: an inactive query is marked, never refetched. */
async function primeDetail(queryClient: QueryClient) {
  await queryClient.fetchQuery({
    queryKey: queryKeys.entries.detail(TRIP),
    queryFn: () => api.get<EntryDetailResponse>(`/entries/${TRIP}`),
  });
}

const openCount = (queryClient: QueryClient) =>
  queryClient.getQueryData<Entry[]>(queryKeys.entries.list())?.find((e) => e.id === ENTRY)?.todos_open_count;

const detailInvalidated = (queryClient: QueryClient) =>
  queryClient.getQueryState(queryKeys.entries.detail(TRIP))?.isInvalidated;

/**
 * The two mounted queries plus every to-do mutation, on one entry. The id is
 * passed in rather than looked up per render: the delete test removes the row
 * this component would look up, and re-rendering must not depend on it.
 */
function useBoard(todoId: number) {
  return {
    entries: useEntries(),
    todos: useTodos({ entry_id: ENTRY }),
    create: useCreateTodo(),
    update: useUpdateTodo(todoId),
    remove: useDeleteTodo(),
  };
}

async function mountBoard() {
  const { queryClient, wrapper } = setup();
  const todoId = db.todos.find((t) => t.entry_id === ENTRY)!.id;
  const { result } = renderHook(useBoard, { wrapper, initialProps: todoId });
  await waitFor(() => expect(result.current.entries.isSuccess).toBe(true));
  await waitFor(() => expect(result.current.todos.isSuccess).toBe(true));
  await primeDetail(queryClient);
  expect(openCount(queryClient)).toBe(1);
  expect(detailInvalidated(queryClient)).toBe(false);
  return { queryClient, result, todoId };
}

beforeEach(() => {
  db.currentUserId = DEMO;
});

describe('to-do mutations and the entries cache', () => {
  it('refetches entries after a create, so the open count climbs', async () => {
    const { queryClient, result } = await mountBoard();

    result.current.create.mutate({ title: 'Book the garden slot', entry_id: ENTRY });
    await waitFor(() => expect(result.current.create.isSuccess).toBe(true));

    await waitFor(() => expect(openCount(queryClient)).toBe(2));
    expect(detailInvalidated(queryClient)).toBe(true);
    // The mutation's own key is still invalidated too.
    expect(result.current.todos.data).toHaveLength(2);
  });

  it('refetches entries after an update, so ticking the last to-do clears the count', async () => {
    const { queryClient, result } = await mountBoard();

    result.current.update.mutate({ done_at: '2026-08-18T09:00:00Z' });
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));

    await waitFor(() => expect(openCount(queryClient)).toBe(0));
    expect(detailInvalidated(queryClient)).toBe(true);
  });

  it('refetches entries after a delete, so the count drops with the row', async () => {
    const { queryClient, result, todoId } = await mountBoard();

    result.current.remove.mutate(todoId);
    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));

    await waitFor(() => expect(openCount(queryClient)).toBe(0));
    expect(detailInvalidated(queryClient)).toBe(true);
    expect(result.current.todos.data).toHaveLength(0);
  });
});
