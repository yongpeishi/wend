import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from './client';
import { queryKeys } from './queryKeys';
import { usePendingLinkChildIds, useReorderLinks } from './links';
import {
  LINK_MUTATION_KEY,
  findCachedEntry,
  linkTouch,
  optimisticAddChild,
  optimisticRemoveChild,
  reorderChildren,
} from './linkCache';
import type { Entry, EntryDetailResponse } from './types';
import { db, findEntry, toEntry, toEntryDetail } from '../mocks/db';

// Bundle 4 ("Nishiki market crawl") holds 6/7/8 in the MSW seed.
const BUNDLE_ID = 4;

function entry(id: number): Entry {
  return toEntry(findEntry(id)!, db.currentUserId);
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(queryKeys.entries.detail(BUNDLE_ID), toEntryDetail(findEntry(BUNDLE_ID)!, db.currentUserId));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const childIds = () =>
    queryClient.getQueryData<EntryDetailResponse>(queryKeys.entries.detail(BUNDLE_ID))!.children.map((c) => c.id);
  return { queryClient, wrapper, childIds };
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

describe('useReorderLinks', () => {
  it('reorders the plan immediately and sends the full order', async () => {
    const { wrapper, childIds } = setup();
    const request = deferred<{ links: unknown[] }>();
    const post = vi.spyOn(api, 'post').mockReturnValue(request.promise);
    const { result } = renderHook(() => useReorderLinks(BUNDLE_ID), { wrapper });

    act(() => result.current.mutate({ childIds: [8, 6, 7], movedId: 8 }));

    await waitFor(() => expect(childIds()).toEqual([8, 6, 7]));
    expect(result.current.isPending).toBe(true);
    // `movedId` is UI-only; the wire body is unchanged.
    expect(post).toHaveBeenCalledWith(`/entries/${BUNDLE_ID}/links/reorder`, { child_ids: [8, 6, 7] });

    request.resolve({ links: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(childIds()).toEqual([8, 6, 7]);
  });

  it('restores the previous order when the server rejects', async () => {
    const { wrapper, childIds } = setup();
    vi.spyOn(api, 'post').mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    const { result } = renderHook(() => useReorderLinks(BUNDLE_ID), { wrapper });

    act(() => result.current.mutate({ childIds: [8, 6, 7], movedId: 8 }, { onError }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(childIds()).toEqual([6, 7, 8]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('usePendingLinkChildIds', () => {
  it('holds the moved id while the reorder is in flight and empties once it settles', async () => {
    const { wrapper } = setup();
    const request = deferred<{ links: unknown[] }>();
    vi.spyOn(api, 'post').mockReturnValue(request.promise);
    const { result, rerender } = renderHook(
      () => ({ reorder: useReorderLinks(BUNDLE_ID), pending: usePendingLinkChildIds(BUNDLE_ID), other: usePendingLinkChildIds(9) }),
      { wrapper },
    );

    expect(result.current.pending.size).toBe(0);
    const idle = result.current.pending;

    act(() => result.current.reorder.mutate({ childIds: [8, 6, 7], movedId: 8 }));

    await waitFor(() => expect([...result.current.pending]).toEqual([8]));
    // Another plan's rows are untouched by this mutation.
    expect(result.current.other.size).toBe(0);

    // Identity holds across an unrelated re-render while the contents don't change.
    const during = result.current.pending;
    rerender();
    expect(result.current.pending).toBe(during);

    request.resolve({ links: [] });
    await waitFor(() => expect(result.current.pending.size).toBe(0));
    expect(result.current.pending).toBe(idle);
  });

  it('fades nothing for a reorder without a movedId', async () => {
    const { wrapper } = setup();
    vi.spyOn(api, 'post').mockReturnValue(deferred<{ links: unknown[] }>().promise);
    const { result } = renderHook(
      () => ({ reorder: useReorderLinks(BUNDLE_ID), pending: usePendingLinkChildIds(BUNDLE_ID) }),
      { wrapper },
    );

    act(() => result.current.reorder.mutate({ childIds: [8, 6, 7] }));

    await waitFor(() => expect(result.current.reorder.isPending).toBe(true));
    expect(result.current.pending.size).toBe(0);
  });
});

describe('linkTouch', () => {
  it.each([
    [['links', 'create', 4], { child_id: 10, position: 1 }, { parentId: 4, childIds: [10] }],
    [['links', 'position', 4], { childId: 10, position: 1 }, { parentId: 4, childIds: [10] }],
    [['links', 'delete', 4], 10, { parentId: 4, childIds: [10] }],
    [['links', 'reorder', 4], { childIds: [8, 6, 7], movedId: 8 }, { parentId: 4, childIds: [8] }],
    [['links', 'reorder', 4], { childIds: [8, 6, 7] }, { parentId: 4, childIds: [] }],
    [['links', 'add'], { parentId: 4, childId: 10 }, { parentId: 4, childIds: [10] }],
    [['links', 'remove'], { parentId: 4, childId: 10 }, { parentId: 4, childIds: [10] }],
  ])('reads %j with %j as %j', (key, variables, expected) => {
    expect(linkTouch(key, variables)).toEqual(expected);
  });

  it.each([
    [undefined, { parentId: 4, childId: 10 }],
    [['entries', 'create'], { parentId: 4, childId: 10 }],
    [['links', 'something-else', 4], { childId: 10 }],
    [['links', 'create'], { child_id: 10 }], // static-parent hook with no parent in the key
    [['links', 'add'], { childId: 10 }], // dynamic-parent hook with no parent in the variables
  ])('is undefined for %j', (key, variables) => {
    expect(linkTouch(key, variables)).toBeUndefined();
  });

  it('shares its prefix with LINK_MUTATION_KEY', () => {
    expect(LINK_MUTATION_KEY).toEqual(['links']);
  });
});

describe('linkCache', () => {
  it('reorderChildren puts unlisted ids after the listed ones, in their old relative order', () => {
    const children = [entry(6), entry(7), entry(8)];
    expect(reorderChildren(children, [8]).map((c) => c.id)).toEqual([8, 6, 7]);
    expect(reorderChildren(children, [7, 6]).map((c) => c.id)).toEqual([7, 6, 8]);
    expect(reorderChildren(children, [999, 8, 6]).map((c) => c.id)).toEqual([8, 6, 7]);
    // Never the same array back.
    expect(reorderChildren(children, [6, 7, 8])).not.toBe(children);
  });

  it('optimisticRemoveChild floors the parent row\'s children_count at 0', async () => {
    const { queryClient } = setup();
    const listKey = queryKeys.entries.list({ trip_id: 1 });
    queryClient.setQueryData(listKey, [{ ...entry(BUNDLE_ID), children_count: 0 }]);

    await optimisticRemoveChild(queryClient, BUNDLE_ID, 7);

    expect(queryClient.getQueryData<Entry[]>(listKey)![0].children_count).toBe(0);
  });

  it('optimisticAddChild leaves the cache alone when the child is nowhere in it', async () => {
    const { queryClient, childIds } = setup();
    const before = queryClient.getQueryData<EntryDetailResponse>(queryKeys.entries.detail(BUNDLE_ID));

    const snap = await optimisticAddChild(queryClient, BUNDLE_ID, 12345);

    expect(childIds()).toEqual([6, 7, 8]);
    expect(queryClient.getQueryData(queryKeys.entries.detail(BUNDLE_ID))).toBe(before);
    expect(snap.detail).toBe(before);
  });

  it('optimisticAddChild inserts at the given position without touching the original arrays', async () => {
    const { queryClient, childIds } = setup();
    const before = queryClient.getQueryData<EntryDetailResponse>(queryKeys.entries.detail(BUNDLE_ID))!;
    // Entry 10 is only reachable through bundle 9's cached children.
    queryClient.setQueryData(queryKeys.entries.detail(9), toEntryDetail(findEntry(9)!, db.currentUserId));

    await optimisticAddChild(queryClient, BUNDLE_ID, 10, 1);

    expect(childIds()).toEqual([6, 10, 7, 8]);
    expect(before.children.map((c) => c.id)).toEqual([6, 7, 8]);
  });

  it('findCachedEntry looks in the detail, then lists, then other bundles\' children', () => {
    const { queryClient } = setup();
    expect(findCachedEntry(queryClient, 7)?.id).toBe(7); // bundle 4's children
    expect(findCachedEntry(queryClient, 10)).toBeUndefined();

    queryClient.setQueryData(queryKeys.entries.list({ trip_id: 1 }), [entry(10)]);
    expect(findCachedEntry(queryClient, 10)?.id).toBe(10);

    queryClient.setQueryData(queryKeys.entries.detail(11), toEntryDetail(findEntry(11)!, db.currentUserId));
    expect(findCachedEntry(queryClient, 11)?.id).toBe(11);
  });
});
