import { useMemo } from 'react';
import { useEntryGraph } from '../../api';
import type { Entry } from '../../api/types';
import { buildTreeFromGraph } from './graphTree';

/**
 * Derives every bundle's direct members from ONE `GET /entries/:tripId/graph`
 * call, as a bundleId -> members map in `entry_links.position` order. Lifted
 * to one place (rather than each BundleCard fetching its own) because the
 * "Add to bundle" menu on every idea row also needs to know, for a single
 * idea, which bundles already contain it — that's a query across all
 * bundles, not one.
 *
 * This replaced a `useQueries` fan-out of `GET /entries/:id` per bundle — an
 * N+1 that grew with the board. The graph response carries the whole visible
 * subtree with its links, and `buildTreeFromGraph` keeps the property the
 * detail endpoint gave us: `childrenOf` is in link `position` order, the same
 * order `useReorderLinks`/`useUpdateLinkPosition` change — so drag/move-up/
 * move-down in BundleCard are reflected here once the query re-settles. The
 * graph query key sits under the `['entries']` prefix, so the existing
 * invalidation every create/update/link mutation already does refreshes it.
 *
 * The map is memoized on `[bundles, data]`: `useQuery` hands back a
 * referentially stable `data` between refetches (unlike `useQueries`' fresh
 * results array, which is what forced the old `combine` dance), so the Map
 * keeps its identity across rerenders and IdeaRow's `bundleNames` memos stay
 * quiet. Before the graph settles — or with no tripId at all — every bundle
 * maps to [], present but empty.
 */
export function useBundleMembers(bundles: Entry[], tripId: number | undefined): Map<number, Entry[]> {
  const { data } = useEntryGraph(tripId, { tripId });

  return useMemo(() => {
    const tree = data ? buildTreeFromGraph(data) : null;
    const map = new Map<number, Entry[]>();
    for (const bundle of bundles) {
      map.set(bundle.id, tree ? tree.childrenOf(bundle.id) : []);
    }
    return map;
  }, [bundles, data]);
}
