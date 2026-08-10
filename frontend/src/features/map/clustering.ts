import type { Cluster, ClusterPoint } from './types';

/**
 * Simple grid clustering — no dependency, no access to a live map. Points are
 * bucketed into cells of `cellSizeDeg` degrees on a side; each bucket becomes
 * one cluster at its members' centroid. This is deliberately not
 * pixel-accurate (a real implementation would project to screen space) but it
 * is cheap, pure, and testable without a rendered Leaflet instance, which is
 * what actually matters for dense-pin trips at MVP scale.
 */
export function clusterPoints<T extends ClusterPoint>(points: T[], cellSizeDeg: number): Cluster<T>[] {
  if (cellSizeDeg <= 0) return points.map((p) => ({ lat: p.lat, lng: p.lng, points: [p] }));

  const cells = new Map<string, T[]>();
  for (const point of points) {
    const cellX = Math.floor(point.lat / cellSizeDeg);
    const cellY = Math.floor(point.lng / cellSizeDeg);
    const key = `${cellX}:${cellY}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(point);
    else cells.set(key, [point]);
  }

  return Array.from(cells.values()).map((bucket) => ({
    lat: bucket.reduce((sum, p) => sum + p.lat, 0) / bucket.length,
    lng: bucket.reduce((sum, p) => sum + p.lng, 0) / bucket.length,
    points: bucket,
  }));
}

/**
 * Cell size shrinks as you zoom in, so pins that were one cluster at a
 * continent view separate out once you're looking at a single city. Values
 * tuned so a Kyoto-sized trip (a few km across) fully separates by z=13-14,
 * Leaflet's usual "walking around a city" zoom.
 */
export function cellSizeForZoom(zoom: number): number {
  return 60 / Math.pow(2, zoom);
}

/** A cluster of exactly one point isn't a cluster — it's just a pin. */
export function isMultiPointCluster<T extends ClusterPoint>(cluster: Cluster<T>): boolean {
  return cluster.points.length > 1;
}
