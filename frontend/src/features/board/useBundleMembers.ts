import { useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { api, queryKeys } from '../../api';
import type { Entry, EntryDetailResponse } from '../../api/types';

/**
 * Fetches the direct children of every bundle in `bundles` in parallel, and
 * returns a bundleId -> members map, in `entry_links.position` order. Lifted
 * to one place (rather than each BundleCard fetching its own) because the
 * "Add to bundle" menu on every idea row also needs to know, for a single
 * idea, which bundles already contain it — that's a query across all
 * bundles, not one.
 *
 * This deliberately calls `GET /entries/:id` (the detail endpoint), not
 * `GET /entries?parent_id=X` — the list endpoint orders by entry id
 * (backend: `entries.order(:id)`), which is not the reorderable sequence a
 * bundle needs. The detail endpoint's `children` comes from the `children`
 * association, which the model orders by `position` (`has_many :children,
 * -> { order(:position) }`), the same order `useReorderLinks`/
 * `useUpdateLinkPosition` change — so drag/move-up/move-down in BundleCard
 * are reflected here once the query re-settles. Using the same query key
 * `useEntry` uses (`queryKeys.entries.detail`) with the same response shape
 * keeps this cache-compatible with the entry drawer and with the existing
 * `['entries']`-prefix invalidation every create/update/link mutation
 * already does — introducing a new key here would fall outside that prefix
 * and silently stop refreshing.
 *
 * The map is built via `useQueries`' `combine` option rather than a
 * `useMemo` over the results array: in TanStack Query v5, `useQueries`
 * returns a fresh array each render, so a `useMemo` keyed on it recomputed
 * (and re-created the Map) every render, cascading into every IdeaRow's
 * `bundleNames` memo. `combine`'s output is memoized by the library, so the
 * Map keeps its identity while `bundles` and the query results are stable —
 * which is why `combine` is wrapped in `useCallback` on `bundles`: a fresh
 * combine function would defeat that memoization.
 */
export function useBundleMembers(bundles: Entry[]): Map<number, Entry[]> {
  const combine = useCallback(
    (results: UseQueryResult<EntryDetailResponse>[]) => {
      const map = new Map<number, Entry[]>();
      bundles.forEach((bundle, index) => {
        map.set(bundle.id, results[index]?.data?.children ?? []);
      });
      return map;
    },
    [bundles],
  );

  return useQueries({
    queries: bundles.map((bundle) => ({
      queryKey: queryKeys.entries.detail(bundle.id),
      queryFn: () => api.get<EntryDetailResponse>(`/entries/${bundle.id}`),
    })),
    combine,
  });
}
