import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useBundleMembers } from './useBundleMembers';
import type { Entry } from '../../api/types';

// Runs against the MSW handlers' seeded db, through the ONE
// GET /entries/1/graph call the hook now makes: bundle 4 ("Nishiki market
// crawl") holds entries 6/7/8 and bundle 9 ("A night out in Pontocho") holds
// 3/10/11, each linked in position order — which is exactly the order the
// graph's links must yield members in.

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'bundle',
    title: 'Untitled',
    description: null,
    category: null,
    starts_on: null,
    ends_on: null,
    location_name: null,
    address: null,
    lat: null,
    lng: null,
    duration_minutes: null,
    source_url: null,
    notes: null,
    from_entry_id: null,
    to_entry_id: null,
    pros: [],
    cons: [],
    archived_at: null,
    created_at: '',
    updated_at: '',
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
    ...overrides,
  };
}

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('useBundleMembers', () => {
  it('maps each bundle to its members in link (position) order once the graph resolves', async () => {
    const { wrapper } = setup();
    const bundles = [makeEntry({ id: 4 }), makeEntry({ id: 9 })];
    const { result } = renderHook(() => useBundleMembers(bundles, 1), { wrapper });

    await waitFor(() => expect(result.current.get(4)?.length).toBe(3));
    await waitFor(() => expect(result.current.get(9)?.length).toBe(3));

    expect(result.current.get(4)?.map((e) => e.title)).toEqual([
      'Coffee at Weekenders',
      'Nishiki market',
      'Teramachi arcade',
    ]);
    expect(result.current.get(9)?.map((e) => e.title)).toEqual([
      'Kiyamachi',
      'Kamo river walk',
      'Yakitori under the tracks',
    ]);
  });

  it('returns an identity-stable Map across a rerender with the same bundles reference', async () => {
    const { wrapper } = setup();
    const bundles = [makeEntry({ id: 4 })];
    const { result, rerender } = renderHook(() => useBundleMembers(bundles, 1), { wrapper });

    await waitFor(() => expect(result.current.get(4)?.length).toBe(3));
    const settled = result.current;

    rerender();
    expect(result.current).toBe(settled);
  });

  it('yields [] for a bundle the graph does not know', async () => {
    const { wrapper } = setup();
    // 999 is not in the seeded db, so it never appears in the trip's graph.
    const bundles = [makeEntry({ id: 4 }), makeEntry({ id: 999 })];
    const { result } = renderHook(() => useBundleMembers(bundles, 1), { wrapper });

    // Before anything resolves, every bundle is present and empty — not absent.
    expect(result.current.get(4)).toEqual([]);
    expect(result.current.get(999)).toEqual([]);

    await waitFor(() => expect(result.current.get(4)?.length).toBe(3));
    expect(result.current.get(999)).toEqual([]);
  });

  it('yields an all-empty map while there is no trip to ask about', () => {
    const { wrapper } = setup();
    const bundles = [makeEntry({ id: 4 })];
    const { result } = renderHook(() => useBundleMembers(bundles, undefined), { wrapper });
    expect(result.current.get(4)).toEqual([]);
  });
});
