import { describe, expect, it } from 'vitest';
import { cellSizeForZoom, clusterPoints, isMultiPointCluster } from './clustering';

describe('clusterPoints', () => {
  it('groups points that fall in the same grid cell', () => {
    const points = [
      { id: 1, lat: 35.011, lng: 135.768 },
      { id: 2, lat: 35.012, lng: 135.769 },
      { id: 3, lat: 34.0, lng: 137.0 }, // far away — its own cluster
    ];
    const clusters = clusterPoints(points, 0.5);
    expect(clusters).toHaveLength(2);
    const sizes = clusters.map((c) => c.points.length).sort();
    expect(sizes).toEqual([1, 2]);
  });

  it('never drops a point — every input point appears in exactly one cluster', () => {
    const points = Array.from({ length: 12 }, (_, i) => ({ id: i, lat: i * 0.001, lng: i * 0.001 }));
    const clusters = clusterPoints(points, 0.01);
    const total = clusters.reduce((sum, c) => sum + c.points.length, 0);
    expect(total).toBe(points.length);
  });

  it('gives every point its own cluster when the cell size is zero or smaller', () => {
    const points = [
      { id: 1, lat: 1, lng: 1 },
      { id: 2, lat: 1, lng: 1 },
    ];
    expect(clusterPoints(points, 0)).toHaveLength(2);
  });

  it('places the cluster centroid at the average of its members', () => {
    const points = [
      { id: 1, lat: 10, lng: 20 },
      { id: 2, lat: 20, lng: 30 },
    ];
    const [cluster] = clusterPoints(points, 100);
    expect(cluster?.lat).toBe(15);
    expect(cluster?.lng).toBe(25);
  });
});

describe('cellSizeForZoom', () => {
  it('shrinks as zoom increases, so pins separate as you zoom in', () => {
    expect(cellSizeForZoom(10)).toBeGreaterThan(cellSizeForZoom(14));
  });
});

describe('isMultiPointCluster', () => {
  it('is false for a single-point cluster and true otherwise', () => {
    expect(isMultiPointCluster({ lat: 0, lng: 0, points: [{ id: 1, lat: 0, lng: 0 }] })).toBe(false);
    expect(
      isMultiPointCluster({
        lat: 0,
        lng: 0,
        points: [
          { id: 1, lat: 0, lng: 0 },
          { id: 2, lat: 0, lng: 0 },
        ],
      }),
    ).toBe(true);
  });
});
