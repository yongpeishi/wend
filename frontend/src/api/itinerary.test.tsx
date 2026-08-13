import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from './queryKeys';
import { useForkDay, useItinerary, useKeepVersion, useUpdateTripDay } from './itinerary';
import type { TripDay } from './types';

// The seam against the MSW handlers. What is worth testing here is the cache
// contract from CONTRACT §3: a mutation's response replaces one day in the
// itinerary list without a refetch, and the schedule queries — a different
// endpoint over the same rows — are invalidated alongside it.

const TRIP_ID = 1;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const cached = (queryClient: QueryClient) => queryClient.getQueryData<TripDay[]>(queryKeys.itinerary.trip(TRIP_ID));

describe('useItinerary', () => {
  it('fetches the trip days, and stays idle without a trip id', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useItinerary(TRIP_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((d) => d.day)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);

    const { result: idle } = renderHook(() => useItinerary(undefined), { wrapper });
    expect(idle.current.fetchStatus).toBe('idle');
  });
});

describe('itinerary mutations', () => {
  it('replaces the day it changed in the cache, and marks the schedule stale', async () => {
    const { queryClient, wrapper } = setup();
    await queryClient.fetchQuery({
      queryKey: queryKeys.schedule.day(TRIP_ID, undefined),
      queryFn: () => Promise.resolve([]),
    });
    const { result: list } = renderHook(() => useItinerary(TRIP_ID), { wrapper });
    await waitFor(() => expect(list.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useKeepVersion(TRIP_ID), { wrapper });
    const versionB = cached(queryClient)?.[1]?.versions[1];
    result.current.mutate({ versionId: versionB?.id as number });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const days = cached(queryClient);
    expect(days).toHaveLength(3);
    expect(days?.[1]?.versions.map((v) => v.name)).toEqual(['Version A']);
    expect(days?.[1]?.versions[0]?.id).toBe(versionB?.id);
    // Untouched days are left exactly as they were, not refetched into place.
    expect(days?.[0]?.day).toBe('2026-11-02');
    expect(queryClient.getQueryState(queryKeys.schedule.day(TRIP_ID, undefined))?.isInvalidated).toBe(true);
  });

  it('inserts a day that had no row yet, in date order', async () => {
    const { queryClient, wrapper } = setup();
    const { result: list } = renderHook(() => useItinerary(TRIP_ID), { wrapper });
    await waitFor(() => expect(list.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useUpdateTripDay(TRIP_ID), { wrapper });
    result.current.mutate({ day: '2026-11-03', lodging_label: 'Ryokan by the river' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cached(queryClient)?.[1]?.lodging_title).toBe('Ryokan by the river');

    // 11-01 is before every day in the list: inserted, then sorted, not appended.
    const { result: fresh } = renderHook(() => useUpdateTripDay(TRIP_ID), { wrapper });
    fresh.current.mutate({ day: '2026-11-01', lodging_label: 'The overnight flight' });
    await waitFor(() => expect(fresh.current.isSuccess).toBe(true));
    expect(cached(queryClient)?.map((d) => d.day)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('forks a day through the versions endpoint', async () => {
    const { queryClient, wrapper } = setup();
    const { result: list } = renderHook(() => useItinerary(TRIP_ID), { wrapper });
    await waitFor(() => expect(list.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useForkDay(TRIP_ID), { wrapper });
    result.current.mutate({ day: '2026-11-02' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cached(queryClient)?.[0]?.versions.map((v) => v.name)).toEqual(['Version A', 'Version B']);
  });
});
