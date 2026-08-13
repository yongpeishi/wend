import type { Bounds, ClusterPoint } from './types';

/** The smallest box containing every point, padded a little so edge pins aren't clipped. */
export function boundsForPoints(points: ClusterPoint[], padDeg = 0.01): Bounds | null {
  if (points.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const p of points) {
    if (p.lat > north) north = p.lat;
    if (p.lat < south) south = p.lat;
    if (p.lng > east) east = p.lng;
    if (p.lng < west) west = p.lng;
  }
  return { north: north + padDeg, south: south - padDeg, east: east + padDeg, west: west - padDeg };
}

/**
 * The same box as `boundsForPoints`, in the corner-pair shape every "fit the
 * view to these" call site needs. Three places in MapView.tsx want it (first
 * fit, re-fit on request, zooming a cluster open) and each one of them would
 * otherwise re-spell the same nested-array literal from a Bounds — a shape
 * that is easy to get subtly wrong (south/west first) and impossible to
 * notice, because jsdom can't render the map that would show the mistake.
 * Keeping it here keeps it unit-testable.
 */
export function boundsTupleForPoints(points: ClusterPoint[]): [[number, number], [number, number]] | null {
  const bounds = boundsForPoints(points);
  if (!bounds) return null;
  return [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ];
}

export function isWithinBounds(point: ClusterPoint, bounds: Bounds): boolean {
  return point.lat <= bounds.north && point.lat >= bounds.south && point.lng <= bounds.east && point.lng >= bounds.west;
}

/** Filters a list of anything with lat/lng down to what the current map view shows. */
export function entriesInBounds<T extends ClusterPoint>(points: T[], bounds: Bounds | null): T[] {
  if (!bounds) return points;
  return points.filter((p) => isWithinBounds(p, bounds));
}
