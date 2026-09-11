import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { useDeleteForGood } from './useDeleteForGood';
import { queryKeys } from '../api';
import { server } from '../mocks/server';
import { allocateId, db, findEntry, now, toEntry } from '../mocks/db';

// Runs against the MSW seed and its real handler, not a stub: trip 1 holds
// bundle 4 ("Nishiki market crawl") with ideas 6/7/8 under it, and bundle 9
// with 3/10/11. The counts in these tests are therefore the ones the mock db
// actually computes — if the graph changes, they change with it.
const BUNDLE_ID = 4;
const TRIP_ID = 1;
const LIBRARY_ID = 5;

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const onDeleted = vi.fn();
  const onError = vi.fn();
  const hook = renderHook(() => useDeleteForGood({ onDeleted, onError }), { wrapper });
  return { ...hook, queryClient, onDeleted, onError };
}

/** The verb only exists on things already set aside, so every case starts
 *  there — the server refuses anything else outright. */
function setAside(id: number) {
  const entry = findEntry(id);
  if (!entry) throw new Error(`no entry ${id}`);
  entry.archived_at = now();
  return toEntry(entry, db.currentUserId);
}

beforeEach(() => {
  // Signed in as the demo user, who owns the seeded trip and wrote everything
  // in it — the ordinary case.
  db.currentUserId = 1;
});

describe('useDeleteForGood — asking', () => {
  it('opens the dialog on the refusal, carrying the counts the server sent', async () => {
    const { result } = setup();
    const bundle = setAside(BUNDLE_ID);

    act(() => result.current.request(bundle));

    await waitFor(() => expect(result.current.modalProps.open).toBe(true));
    expect(result.current.target).toBe(bundle);
    expect(result.current.modalProps.preview).toEqual({
      title: 'Nishiki market crawl',
      kind: 'bundle',
      votesCount: 0,
      todosCount: 0,
      // Every trip ancestor the caller can see — the modal filters out the one
      // whose screen it is on, not the server.
      trips: [{ id: TRIP_ID, title: 'Six days in Kyoto' }],
      descendantsDestroyedCount: 3,
      descendantsSurvivingCount: 0,
      descendantsLeftBehindCount: 0,
    });
  });

  it('destroys nothing while it is only asking', async () => {
    const { result } = setup();
    const bundle = setAside(BUNDLE_ID);

    act(() => result.current.request(bundle));

    await waitFor(() => expect(result.current.modalProps.open).toBe(true));
    expect(findEntry(BUNDLE_ID)).toBeDefined();
    expect(findEntry(6)).toBeDefined();
  });

  // The counts are of what goes, not of what exists: the trip's own to-do and
  // the votes on the ideas inside it are all going.
  it('counts the votes and to-dos of the whole subtree on a trip', async () => {
    const { result } = setup();
    const trip = setAside(TRIP_ID);

    act(() => result.current.request(trip));

    await waitFor(() => expect(result.current.modalProps.open).toBe(true));
    expect(result.current.modalProps.preview).toMatchObject({
      kind: 'trip',
      votesCount: 3,
      todosCount: 2,
      // A trip hangs under no trip.
      trips: [],
      descendantsDestroyedCount: 9,
      descendantsSurvivingCount: 0,
    });
  });

  it('counts an idea that lives somewhere else as a survivor', async () => {
    // Idea 7 gains a second home outside the bundle, so deleting the bundle
    // cannot take it: the parent chain that does not run through the bundle
    // keeps it alive.
    db.links.push({
      id: allocateId(),
      parent_id: LIBRARY_ID,
      child_id: 7,
      position: 0,
      created_at: now(),
      updated_at: now(),
    });
    const { result } = setup();
    const bundle = setAside(BUNDLE_ID);

    act(() => result.current.request(bundle));

    await waitFor(() => expect(result.current.modalProps.open).toBe(true));
    expect(result.current.modalProps.preview).toMatchObject({
      descendantsDestroyedCount: 2,
      descendantsSurvivingCount: 1,
    });
  });

  // Not a state the dialog renders: the verb is only offered on archived
  // things, so this means the UI sent a request it should never have sent.
  it('reports a live entry as an error rather than opening the dialog', async () => {
    const { result, onError } = setup();
    const live = toEntry(findEntry(BUNDLE_ID)!, db.currentUserId);

    act(() => result.current.request(live));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Set it aside first, then you can delete it for good.'));
    expect(result.current.modalProps.open).toBe(false);
    expect(findEntry(BUNDLE_ID)).toBeDefined();
  });
});

describe('useDeleteForGood — answering', () => {
  it('destroys the thing and its sole children, then closes and says so', async () => {
    const { result, onDeleted } = setup();
    const bundle = setAside(BUNDLE_ID);
    act(() => result.current.request(bundle));
    await waitFor(() => expect(result.current.modalProps.open).toBe(true));

    act(() => result.current.modalProps.onConfirm());

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(bundle));
    expect(result.current.target).toBeNull();
    expect(result.current.modalProps.open).toBe(false);
    expect(findEntry(BUNDLE_ID)).toBeUndefined();
    expect([6, 7, 8].map(findEntry)).toEqual([undefined, undefined, undefined]);
    // The links to them go with them; nothing else in the trip is touched.
    expect(db.links.some((l) => l.parent_id === BUNDLE_ID || l.child_id === BUNDLE_ID)).toBe(false);
    expect(findEntry(9)).toBeDefined();
  });

  it('leaves the one that lives somewhere else exactly where it is', async () => {
    db.links.push({
      id: allocateId(),
      parent_id: LIBRARY_ID,
      child_id: 7,
      position: 0,
      created_at: now(),
      updated_at: now(),
    });
    const { result } = setup();
    const bundle = setAside(BUNDLE_ID);
    act(() => result.current.request(bundle));
    await waitFor(() => expect(result.current.modalProps.open).toBe(true));

    act(() => result.current.modalProps.onConfirm());

    await waitFor(() => expect(findEntry(BUNDLE_ID)).toBeUndefined());
    expect(findEntry(7)).toBeDefined();
    expect(db.links.some((l) => l.parent_id === LIBRARY_ID && l.child_id === 7)).toBe(true);
  });

  it('repaints the entries, the itinerary and the schedule — placements go with the row', async () => {
    const { result, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const bundle = setAside(BUNDLE_ID);
    act(() => result.current.request(bundle));
    await waitFor(() => expect(result.current.modalProps.open).toBe(true));
    // Nothing was written by the refusal, so nothing was stale.
    expect(invalidate).not.toHaveBeenCalled();

    act(() => result.current.modalProps.onConfirm());

    await waitFor(() => expect(findEntry(BUNDLE_ID)).toBeUndefined());
    const keys = invalidate.mock.calls.map(([arg]) => arg?.queryKey);
    expect(keys).toEqual([queryKeys.entries.all, queryKeys.itinerary.all, queryKeys.schedule.all]);
  });

  it('backs out without destroying anything', async () => {
    const { result, onDeleted } = setup();
    const bundle = setAside(BUNDLE_ID);
    act(() => result.current.request(bundle));
    await waitFor(() => expect(result.current.modalProps.open).toBe(true));

    act(() => result.current.modalProps.onCancel());

    expect(result.current.target).toBeNull();
    expect(result.current.modalProps.open).toBe(false);
    expect(result.current.modalProps.preview).toBeNull();
    expect(findEntry(BUNDLE_ID)).toBeDefined();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  // Nothing was destroyed, so closing would be a lie — and the button has to
  // come back to life or the dialog is a dead end with no way out but Escape.
  it('keeps the dialog open and the button live when the destroy fails', async () => {
    const { result, onError, onDeleted } = setup();
    const bundle = setAside(BUNDLE_ID);
    act(() => result.current.request(bundle));
    await waitFor(() => expect(result.current.modalProps.open).toBe(true));

    server.use(
      http.delete('/api/entries/:id/permanent', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    );
    act(() => result.current.modalProps.onConfirm());

    await waitFor(() => expect(onError).toHaveBeenCalledWith("That didn't go through. Try again in a moment."));
    expect(result.current.modalProps.open).toBe(true);
    expect(result.current.modalProps.deleting).toBe(false);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(findEntry(BUNDLE_ID)).toBeDefined();
  });

  // Same 404 for "not yours" and "not there", deliberately, so one sentence
  // has to be true of both.
  it('says the same thing for gone and for not yours', async () => {
    const { result, onError } = setup();
    const bundle = setAside(BUNDLE_ID);
    act(() => result.current.request(bundle));
    await waitFor(() => expect(result.current.modalProps.open).toBe(true));

    server.use(http.delete('/api/entries/:id/permanent', () => HttpResponse.json({ error: 'Not found' }, { status: 404 })));
    act(() => result.current.modalProps.onConfirm());

    await waitFor(() => expect(onError).toHaveBeenCalledWith("That's gone already, or it isn't yours to delete."));
    expect(result.current.modalProps.open).toBe(true);
  });
});
