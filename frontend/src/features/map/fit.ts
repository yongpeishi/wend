import { boundsTupleForPoints } from './bounds';
import type { Bounds, ClusterPoint } from './types';

/** The breathing room every "fit the view to these" call gives edge pins. */
const FIT_PADDING: [number, number] = [32, 32];

/**
 * The slice of a Leaflet map the fit-and-report path actually touches,
 * spelled structurally so the unit test can hand in a stub. A real L.Map
 * satisfies it as-is; nothing else in features/map needs to know which.
 */
export interface FittableMap {
  invalidateSize(): unknown;
  fitBounds(bounds: [[number, number], [number, number]], options: { padding: [number, number] }): unknown;
  getBounds(): {
    getNorth(): number;
    getSouth(): number;
    getEast(): number;
    getWest(): number;
  };
}

/** The view the map is on right now, in the Bounds shape every onBoundsChange consumer speaks. */
export function readBounds(map: Pick<FittableMap, 'getBounds'>): Bounds {
  const b = map.getBounds();
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
}

/**
 * Fit the view to `points`, then tell the caller where it landed.
 *
 * Both fit paths — the first fit on load and every "Widen" after it — go
 * through here because both had the same hole: `fitBounds` only speaks
 * through moveend, and moveend only fires when the view actually moves. Fit a
 * map that is already on the target view and nothing fires, so a parent whose
 * bounds were seeded from a container Leaflet had not measured yet keeps
 * those stale bounds forever — the board then counts pins "off view" against
 * a viewport nobody is looking at, and Widen re-runs the same no-op fit
 * without ever correcting the record. So the report is explicit: whatever the
 * fit resolved to, the caller hears it, moveend or no moveend.
 *
 * The `invalidateSize` first is the same cold mount seen from the other side.
 * These effects can run before Leaflet has noticed the container's real size,
 * and a fit computed against a size that is wrong lands on the wrong view;
 * re-measuring first makes the fit — and therefore the report — about the map
 * as it is actually drawn. On a map that is already sized it is a no-op.
 */
export function fitAndReport(
  map: FittableMap,
  points: ClusterPoint[],
  onBoundsChange?: (bounds: Bounds) => void,
): void {
  const bounds = boundsTupleForPoints(points);
  if (!bounds) return;
  map.invalidateSize();
  map.fitBounds(bounds, { padding: FIT_PADDING });
  onBoundsChange?.(readBounds(map));
}
