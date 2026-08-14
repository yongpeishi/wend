import { describe, expect, it } from 'vitest';
import { boundsForPoints, boundsTupleForPoints, entriesInBounds, isWithinBounds } from './bounds';

describe('boundsForPoints', () => {
  it('returns null for an empty list — there is nothing to fit to', () => {
    expect(boundsForPoints([])).toBeNull();
  });

  it('pads the tight box around the points so edge pins are not clipped', () => {
    const bounds = boundsForPoints(
      [
        { id: 1, lat: 10, lng: 20 },
        { id: 2, lat: 12, lng: 22 },
      ],
      0.5,
    );
    expect(bounds).toEqual({ north: 12.5, south: 9.5, east: 22.5, west: 19.5 });
  });
});

describe('boundsTupleForPoints', () => {
  it('returns null for an empty list — there is no view to fit', () => {
    expect(boundsTupleForPoints([])).toBeNull();
  });

  it('orders the corners south-west first, then north-east, the way a map expects them', () => {
    expect(
      boundsTupleForPoints([
        { id: 1, lat: 10, lng: 20 },
        { id: 2, lat: 12, lng: 22 },
      ]),
    ).toEqual([
      [9.99, 19.99],
      [12.01, 22.01],
    ]);
  });
});

describe('isWithinBounds / entriesInBounds', () => {
  const bounds = { north: 10, south: 0, east: 10, west: 0 };

  it('includes points on the edge of the box', () => {
    expect(isWithinBounds({ id: 1, lat: 10, lng: 10 }, bounds)).toBe(true);
    expect(isWithinBounds({ id: 1, lat: 0, lng: 0 }, bounds)).toBe(true);
  });

  it('excludes points outside the box', () => {
    expect(isWithinBounds({ id: 1, lat: 11, lng: 5 }, bounds)).toBe(false);
  });

  it('entriesInBounds returns everything when bounds is null — panning has not narrowed anything yet', () => {
    const points = [{ id: 1, lat: 99, lng: 99 }];
    expect(entriesInBounds(points, null)).toBe(points);
  });

  it('entriesInBounds filters to just what the current view shows', () => {
    const points = [
      { id: 1, lat: 5, lng: 5 },
      { id: 2, lat: 50, lng: 50 },
    ];
    expect(entriesInBounds(points, bounds).map((p) => p.id)).toEqual([1]);
  });
});
