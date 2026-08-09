import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { api, queryKeys } from '../../api';
import type { Entry } from '../../api/types';

/**
 * Fetches the direct children of every bundle in `bundles` in parallel, and
 * returns a bundleId -> members map. Lifted to one place (rather than each
 * BundleCard fetching its own) because the "Add to bundle" menu on every idea
 * row also needs to know, for a single idea, which bundles already contain
 * it — that's a query across all bundles, not one.
 */
export function useBundleMembers(bundles: Entry[]): Map<number, Entry[]> {
  const results = useQueries({
    queries: bundles.map((bundle) => ({
      queryKey: queryKeys.entries.list({ parent_id: bundle.id }),
      queryFn: () => api.get<{ entries: Entry[] }>('/entries', { params: { parent_id: bundle.id } }).then((r) => r.entries),
    })),
  });

  return useMemo(() => {
    const map = new Map<number, Entry[]>();
    bundles.forEach((bundle, index) => {
      map.set(bundle.id, results[index]?.data ?? []);
    });
    return map;
  }, [bundles, results]);
}
