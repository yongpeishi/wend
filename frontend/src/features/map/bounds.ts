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

export function isWithinBounds(point: ClusterPoint, bounds: Bounds): boolean {
  return point.lat <= bounds.north && point.lat >= bounds.south && point.lng <= bounds.east && point.lng >= bounds.west;
}

/** Filters a list of anything with lat/lng down to what the current map view shows. */
export function entriesInBounds<T extends ClusterPoint>(points: T[], bounds: Bounds | null): T[] {
  if (!bounds) return points;
  return points.filter((p) => isWithinBounds(p, bounds));
}
