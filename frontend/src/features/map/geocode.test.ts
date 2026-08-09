import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_INTERVAL_MS, __resetThrottleForTests, parseLatLng, searchPlace, throttle1Hz } from './geocode';

// Every case shares one module-level throttle queue by design (that's what
// makes a burst across the whole app share one 1/sec budget) — reset it
// between tests so one case's pacing doesn't bleed real wall-clock time into
// the next one's assertions.
beforeEach(() => {
  __resetThrottleForTests();
});

describe('parseLatLng', () => {
  it('reads a pasted "lat, lng" pair', () => {
    expect(parseLatLng('35.0116, 135.7681')).toEqual({ lat: 35.0116, lng: 135.7681 });
  });

  it('accepts negative values and tight spacing', () => {
    expect(parseLatLng('-33.87,151.21')).toEqual({ lat: -33.87, lng: 151.21 });
  });

  it('rejects plain text — no geocode result should ever be required to proceed', () => {
    expect(parseLatLng('Fushimi Inari Taisha')).toBeNull();
  });

  it('rejects out-of-range coordinates', () => {
    expect(parseLatLng('200, 50')).toBeNull();
  });

  it('rejects empty input', () => {
    expect(parseLatLng('')).toBeNull();
  });
});

describe('searchPlace', () => {
  it('returns geocode results parsed from the Nominatim response shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '35.0116', lon: '135.7681', display_name: 'Nanzen-ji, Kyoto' }],
    });
    const results = await searchPlace('nanzenji', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(results).toEqual([{ lat: 35.0116, lng: 135.7681, label: 'Nanzen-ji, Kyoto' }]);
  });

  it('resolves to an empty array — never throws — when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => [] });
    await expect(searchPlace('nowhere', { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual([]);
  });

  it('resolves to an empty array — never throws — when the network call rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(searchPlace('nowhere', { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual([]);
  });

  it('resolves to an empty array for blank queries without calling fetch at all', async () => {
    const fetchImpl = vi.fn();
    await expect(searchPlace('   ', { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('throttle1Hz', () => {
  it('serialises calls so a burst starts at least MIN_INTERVAL_MS apart', async () => {
    const starts: number[] = [];
    const task = () => {
      starts.push(Date.now());
      return Promise.resolve();
    };
    await Promise.all([throttle1Hz(task), throttle1Hz(task), throttle1Hz(task)]);
    expect(starts).toHaveLength(3);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(MIN_INTERVAL_MS - 5);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(MIN_INTERVAL_MS - 5);
  }, 10000);

  it('keeps the queue alive even when one task rejects', async () => {
    const first = throttle1Hz(() => Promise.reject(new Error('nope'))).catch(() => 'recovered');
    const second = throttle1Hz(() => Promise.resolve('second'));
    await expect(first).resolves.toBe('recovered');
    await expect(second).resolves.toBe('second');
  }, 10000);
});
