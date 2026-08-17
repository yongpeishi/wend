import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { server } from '../mocks/server';
import { api } from './client';
import { queryKeys } from './queryKeys';
import { useMe, useSignOut } from './session';
import type { Entry, User } from './types';

// The sign-out seam. A signed-out browser must keep nothing but `session: null`:
// every other cached query is the previous traveller's data, and on a shared
// browser it would render for the next one straight from memory, before any
// refetch could correct it. The failure path is the other half of the contract —
// a sign out that did not happen must leave the cache exactly as it was.

/** Both hooks in one component, the way AuthContext mounts them. */
function useSession() {
  return { me: useMe(), signOut: useSignOut() };
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

/** The MSW fixtures start with no session (src/mocks/db.ts). */
async function signIn() {
  await api.post<{ user: User }>('/session', { email: 'demo@wend.app', password: 'password' });
}

/** An unrelated key, filled the way the app fills it — no observer left mounted,
 * since the screens holding these queries are gone by the time we sign out. */
async function cacheEntries(queryClient: QueryClient) {
  await queryClient.fetchQuery({
    queryKey: queryKeys.entries.list(),
    queryFn: () => api.get<{ entries: Entry[] }>('/entries').then((r) => r.entries),
  });
}

describe('useSignOut', () => {
  it('empties a cache that held more than the session', async () => {
    await signIn();
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.me.data?.name).toBe('Demo Traveler'));
    await cacheEntries(queryClient);
    expect(queryClient.getQueryData<Entry[]>(queryKeys.entries.list())?.length).toBeGreaterThan(0);

    await act(() => result.current.signOut.mutateAsync());

    expect(queryClient.getQueryData(queryKeys.entries.list())).toBeUndefined();
    // Nothing but the session survives — not the entries, not anything else.
    expect(queryClient.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([queryKeys.session]);
    // And the server really did drop the session: /api/me is 401 afterwards.
    await expect(api.get('/me')).rejects.toMatchObject({ status: 401 });
  });

  it('leaves the session key holding null — present, not absent', async () => {
    await signIn();
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.me.data?.name).toBe('Demo Traveler'));

    await act(() => result.current.signOut.mutateAsync());

    // useMe has staleTime: Infinity, so the seeded null is what stops it firing
    // a fresh GET /api/me and flashing "Checking your session" on the way out.
    expect(queryClient.getQueryState(queryKeys.session)).toBeDefined();
    expect(queryClient.getQueryData<User | null>(queryKeys.session)).toBeNull();
    // The seeded null is what useMe reads on the next render — no refetch, so
    // nothing to wait on and no spinner between here and /signin.
    await waitFor(() => expect(result.current.me.data).toBeNull());
    expect(result.current.me.isFetching).toBe(false);
  });

  it('rejects and leaves the cache untouched when the request fails', async () => {
    await signIn();
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.me.data?.name).toBe('Demo Traveler'));
    await cacheEntries(queryClient);
    const entries = queryClient.getQueryData<Entry[]>(queryKeys.entries.list());

    server.use(http.delete('/api/session', () => HttpResponse.json({ error: 'Boom' }, { status: 500 })));
    await expect(act(() => result.current.signOut.mutateAsync())).rejects.toMatchObject({ status: 500 });

    expect(queryClient.getQueryData<User | null>(queryKeys.session)?.name).toBe('Demo Traveler');
    expect(queryClient.getQueryData<Entry[]>(queryKeys.entries.list())).toBe(entries);
  });
});
