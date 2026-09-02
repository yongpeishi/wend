import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLinkMutations } from './useLinkMutations';
import { api, queryKeys } from '../../api';
import type { Entry, EntryDetailResponse } from '../../api/types';
import { db, findEntry, toEntry, toEntryDetail } from '../../mocks/db';

// Runs against the MSW seed: bundle 4 ("Nishiki market crawl") holds 6/7/8,
// bundle 9 holds 3/10/11. Caches are seeded from the same db shapes the
// handlers serve, so `parent_ids`/`children_count` start out truthful.

const BUNDLE_ID = 4;
const LIST_KEY = queryKeys.entries.list({ trip_id: 1, kind: 'idea', include_archived: true });

function entry(id: number): Entry {
  return toEntry(findEntry(id)!, db.currentUserId);
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(queryKeys.entries.detail(BUNDLE_ID), toEntryDetail(findEntry(BUNDLE_ID)!, db.currentUserId));
  // The ideas list holds the child we will add (10, currently only in bundle 9),
  // one already a member (7), and the bundle row itself for `children_count`.
  queryClient.setQueryData(LIST_KEY, [entry(10), entry(7), entry(BUNDLE_ID)]);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const childIds = () =>
    queryClient.getQueryData<EntryDetailResponse>(queryKeys.entries.detail(BUNDLE_ID))!.children.map((c) => c.id);
  const listed = (id: number) => queryClient.getQueryData<Entry[]>(LIST_KEY)!.find((e) => e.id === id)!;
  return { queryClient, wrapper, childIds, listed };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => vi.restoreAllMocks());

describe('useLinkMutations — addLink', () => {
  it('shows the member in the plan before the request resolves, and keeps it once it does', async () => {
    const { wrapper, childIds, listed } = setup();
    const request = deferred<{ link: unknown }>();
    const post = vi.spyOn(api, 'post').mockReturnValue(request.promise);
    const { result } = renderHook(() => useLinkMutations(), { wrapper });

    expect(childIds()).toEqual([6, 7, 8]);
    expect(listed(10).parent_ids).toEqual([9]);
    expect(listed(BUNDLE_ID).children_count).toBe(3);

    act(() => result.current.addLink.mutate({ parentId: BUNDLE_ID, childId: 10 }));

    await waitFor(() => expect(childIds()).toEqual([6, 7, 8, 10]));
    expect(post).toHaveBeenCalledWith(`/entries/${BUNDLE_ID}/links`, { child_id: 10 });
    expect(result.current.addLink.isPending).toBe(true);
    expect(listed(10).parent_ids).toEqual([9, BUNDLE_ID]);
    expect(listed(BUNDLE_ID).children_count).toBe(4);

    request.resolve({ link: { id: 99, parent_id: BUNDLE_ID, child_id: 10, position: 3 } });
    await waitFor(() => expect(result.current.addLink.isSuccess).toBe(true));
    expect(childIds()).toEqual([6, 7, 8, 10]);
  });

  it('takes the member out again and restores the list when the server rejects', async () => {
    const { wrapper, childIds, listed } = setup();
    vi.spyOn(api, 'post').mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    const { result } = renderHook(() => useLinkMutations(), { wrapper });

    act(() => result.current.addLink.mutate({ parentId: BUNDLE_ID, childId: 10 }, { onError }));

    await waitFor(() => expect(result.current.addLink.isError).toBe(true));
    expect(childIds()).toEqual([6, 7, 8]);
    expect(listed(10).parent_ids).toEqual([9]);
    expect(listed(BUNDLE_ID).children_count).toBe(3);
    // The caller's per-call callback still fires — that is where the toast lives.
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('does not double up a member the plan already has', async () => {
    const { wrapper, childIds, listed } = setup();
    vi.spyOn(api, 'post').mockReturnValue(deferred<{ link: unknown }>().promise);
    const { result } = renderHook(() => useLinkMutations(), { wrapper });

    act(() => result.current.addLink.mutate({ parentId: BUNDLE_ID, childId: 7 }));

    await waitFor(() => expect(result.current.addLink.isPending).toBe(true));
    expect(childIds()).toEqual([6, 7, 8]);
    expect(listed(BUNDLE_ID).children_count).toBe(3);
  });
});

describe('useLinkMutations — removeLink', () => {
  it('drops the member from the plan before the request resolves', async () => {
    const { wrapper, childIds, listed } = setup();
    const request = deferred<void>();
    const del = vi.spyOn(api, 'delete').mockReturnValue(request.promise);
    const { result } = renderHook(() => useLinkMutations(), { wrapper });

    expect(listed(7).parent_ids).toEqual([BUNDLE_ID]);

    act(() => result.current.removeLink.mutate({ parentId: BUNDLE_ID, childId: 7 }));

    await waitFor(() => expect(childIds()).toEqual([6, 8]));
    expect(del).toHaveBeenCalledWith(`/entries/${BUNDLE_ID}/links/7`);
    expect(listed(7).parent_ids).toEqual([]);
    expect(listed(BUNDLE_ID).children_count).toBe(2);

    request.resolve();
    await waitFor(() => expect(result.current.removeLink.isSuccess).toBe(true));
    expect(childIds()).toEqual([6, 8]);
  });

  it('puts the member back when the server rejects', async () => {
    const { wrapper, childIds, listed } = setup();
    vi.spyOn(api, 'delete').mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useLinkMutations(), { wrapper });

    act(() => result.current.removeLink.mutate({ parentId: BUNDLE_ID, childId: 7 }));

    await waitFor(() => expect(result.current.removeLink.isError).toBe(true));
    expect(childIds()).toEqual([6, 7, 8]);
    expect(listed(7).parent_ids).toEqual([BUNDLE_ID]);
    expect(listed(BUNDLE_ID).children_count).toBe(3);
  });
});

describe('useLinkMutations — settling', () => {
  it('refetches only once the last in-flight link mutation settles', async () => {
    const { queryClient, wrapper } = setup();
    const first = deferred<{ link: unknown }>();
    const second = deferred<{ link: unknown }>();
    vi.spyOn(api, 'post').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useLinkMutations(), { wrapper });

    act(() => {
      result.current.addLink.mutate({ parentId: BUNDLE_ID, childId: 10 });
      result.current.addLink.mutate({ parentId: BUNDLE_ID, childId: 3 });
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(2));

    first.resolve({ link: {} });
    await waitFor(() => expect(queryClient.isMutating()).toBe(1));
    expect(invalidate).not.toHaveBeenCalled();

    second.resolve({ link: {} });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.entries.all });
  });
});
