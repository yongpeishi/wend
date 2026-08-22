import type { GeocodeResult } from './types';

/**
 * Nominatim's usage policy caps requests at ~1/second. This throttle serialises
 * every call through one queue and waits out the remainder of that second
 * before the next one starts, no matter how many searches get fired in a
 * burst (e.g. from a fast typist before debounce even kicks in).
 */
export const MIN_INTERVAL_MS = 1000;

let lastCallStartedAt = 0;
let queue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Test-only: clears queue/timing state so test cases don't leak pacing into one another. */
export function __resetThrottleForTests(): void {
  lastCallStartedAt = 0;
  queue = Promise.resolve();
}

export function throttle1Hz<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, lastCallStartedAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastCallStartedAt = Date.now();
    return fn();
  });
  // Never let a rejected search jam the queue for the next one.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  /** jsonv2's fine-grained kind ('attraction', 'restaurant', …). Optional in the response, optional all the way through. */
  type?: string;
  /** Nominatim counts place ids in numbers; the seam speaks strings — see GeocodeResult.placeId. */
  place_id?: number;
}

export interface SearchPlaceOptions {
  signal?: AbortSignal;
  /** Injectable so callers (and tests) never depend on a real network fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Geocodes free text via Nominatim. Per the maps decision (doc/assumptions.md
 * A0c): a failed request, a timeout, or zero results must never throw or
 * block capturing an idea — every path here resolves to an array, empty on
 * any trouble, so the caller's fallback (drop a pin, paste coordinates) is
 * always available.
 */
export async function searchPlace(query: string, options: SearchPlaceOptions = {}): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    return await throttle1Hz(async () => {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(trimmed)}`;
      const response = await fetchImpl(url, {
        signal: options.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return [];
      const body = (await response.json()) as NominatimResult[];
      // `kind` and `placeId` ride along only when the response carries them —
      // both are optional on GeocodeResult, so a leaner provider (or an older
      // cached response) degrades to the original lat/lng/label shape rather
      // than to undefined-shaped surprises.
      return body.map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lon),
        label: r.display_name,
        kind: r.type,
        placeId: r.place_id != null ? String(r.place_id) : undefined,
      }));
    });
  } catch {
    return [];
  }
}

const LAT_LNG_PATTERN = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/**
 * Recognises a pasted "lat, lng" pair — the other first-class, geocode-free
 * path into capturing a located idea. Rejects out-of-range values rather than
 * silently clamping them, since a typo here should read as "not recognised",
 * not quietly move the pin somewhere wrong.
 */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const match = LAT_LNG_PATTERN.exec(text);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
