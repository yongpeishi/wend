import { describe, expect, it, vi } from 'vitest';
import { fitAndReport, readBounds } from './fit';
import type { FittableMap } from './fit';
import type { Bounds } from './types';

/**
 * A map that behaves the way the defect needs it to: it remembers a view, and
 * `fitBounds` either moves onto the requested box or — when told to play the
 * no-op — stays exactly where it is, the way a real Leaflet map does when the
 * fit resolves to the view it is already on. No moveend ever fires from a
 * stub, which is the point: everything asserted here has to reach the caller
 * through the explicit report, because on a cold mount that is all there is.
 */
function stubMap({ view, fitMoves = true }: { view: Bounds; fitMoves?: boolean }) {
  let current = view;
  const calls: string[] = [];
  const map: FittableMap = {
    invalidateSize() {
      calls.push('invalidateSize');
    },
    fitBounds(bounds) {
      calls.push('fitBounds');
      if (fitMoves) {
        current = { south: bounds[0][0], west: bounds[0][1], north: bounds[1][0], east: bounds[1][1] };
      }
    },
    getBounds() {
      return {
        getNorth: () => current.north,
        getSouth: () => current.south,
        getEast: () => current.east,
        getWest: () => current.west,
      };
    },
  };
  return { map, calls };
}

const WORLD: Bounds = { north: 85, south: -85, east: 180, west: -180 };
const KYOTO = [
  { id: 1, lat: 35.0116, lng: 135.7681 },
  { id: 2, lat: 35.0086, lng: 135.7717 },
];

describe('readBounds', () => {
  it('reads the four edges into the shape onBoundsChange speaks', () => {
    const { map } = stubMap({ view: WORLD });
    expect(readBounds(map)).toEqual(WORLD);
  });
});

describe('fitAndReport', () => {
  it('reports the view the fit landed on, with no moveend to carry it', () => {
    const { map } = stubMap({ view: WORLD });
    const onBoundsChange = vi.fn();

    fitAndReport(map, KYOTO, onBoundsChange);

    expect(onBoundsChange).toHaveBeenCalledTimes(1);
    const reported = onBoundsChange.mock.calls[0]![0] as Bounds;
    // The fitted box holds every point — the report is about where the map
    // ended up, not where it started.
    for (const point of KYOTO) {
      expect(point.lat).toBeLessThanOrEqual(reported.north);
      expect(point.lat).toBeGreaterThanOrEqual(reported.south);
      expect(point.lng).toBeLessThanOrEqual(reported.east);
      expect(point.lng).toBeGreaterThanOrEqual(reported.west);
    }
  });

  it('re-measures before fitting, so the fit is about the container as drawn', () => {
    const { map, calls } = stubMap({ view: WORLD });

    fitAndReport(map, KYOTO);

    expect(calls).toEqual(['invalidateSize', 'fitBounds']);
  });

  it('still reports when the fit is a no-op — the Widen-on-stale-bounds case', () => {
    // The map is already on the target view, so fitBounds moves nothing and a
    // real Leaflet would fire nothing. The caller must hear the truth anyway,
    // or "Widen" leaves the stale record standing.
    const fitted: Bounds = { north: 35.03, south: 34.99, east: 135.79, west: 135.75 };
    const { map } = stubMap({ view: fitted, fitMoves: false });
    const onBoundsChange = vi.fn();

    fitAndReport(map, KYOTO, onBoundsChange);

    expect(onBoundsChange).toHaveBeenCalledTimes(1);
    expect(onBoundsChange).toHaveBeenCalledWith(fitted);
  });

  it('does nothing at all with no points to fit to', () => {
    const { map, calls } = stubMap({ view: WORLD });
    const onBoundsChange = vi.fn();

    fitAndReport(map, [], onBoundsChange);

    expect(calls).toEqual([]);
    expect(onBoundsChange).not.toHaveBeenCalled();
  });

  it('survives having no listener, because two call sites pass one optionally', () => {
    const { map, calls } = stubMap({ view: WORLD });

    expect(() => fitAndReport(map, KYOTO)).not.toThrow();
    expect(calls).toEqual(['invalidateSize', 'fitBounds']);
  });
});
