/**
 * How long it takes to walk somewhere.
 *
 * The backend already hands us a straight-line distance (`distance_km`, a
 * Haversine in SQL) with every nearby place, so we turn that into minutes here
 * rather than asking a routing engine. The public OSM routers are rate-limited
 * demo endpoints and self-hosting one is infrastructure, not a screen; a crow
 * flight stretched by a detour factor is right to within a minute or two at the
 * two-kilometre radius this screen uses.
 *
 * This function is the seam. Swapping in a real router later means changing the
 * body of `walkMinutes` and the one call site that would then have to await it.
 */

/** Comfortable walking pace, km/h. */
export const WALK_KMH = 4.8;
/** Streets are not straight lines; multiply the crow-flight distance by this. */
export const DETOUR_FACTOR = 1.3;

/**
 * Straight-line km -> whole walking minutes. Never returns 0 — anything at all
 * is at least "1 min", because "0 min walk" reads as a bug rather than as
 * "you are standing on it". Negative or non-finite input returns 1.
 */
export function walkMinutes(km: number): number {
  if (!Number.isFinite(km) || km < 0) return 1;
  return Math.max(1, Math.round((km * DETOUR_FACTOR * 60) / WALK_KMH));
}

/**
 * "12 min walk", or null when there is no distance to speak of — an entry with
 * no coordinates comes back without `distance_km` at all, and a missing walk is
 * silence, not "0 min walk".
 */
export function formatWalk(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  return `${walkMinutes(km)} min walk`;
}
