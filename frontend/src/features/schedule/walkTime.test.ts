import { describe, expect, it } from 'vitest';
import { DETOUR_FACTOR, WALK_KMH, formatWalk, walkMinutes } from './walkTime';

describe('walkMinutes', () => {
  it('turns a normal distance into minutes at walking pace, detour included', () => {
    // 1 km -> 1.3 km of streets -> 16.25 min.
    expect(walkMinutes(1)).toBe(16);
    expect(walkMinutes(0.5)).toBe(8);
    expect(walkMinutes(2)).toBe(33);
  });

  it('uses the pinned pace and detour factor', () => {
    expect(WALK_KMH).toBe(4.8);
    expect(DETOUR_FACTOR).toBe(1.3);
    expect(walkMinutes(1)).toBe(Math.round((1 * DETOUR_FACTOR * 60) / WALK_KMH));
  });

  it('never returns 0 — a tiny distance is still a minute', () => {
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(0.001)).toBe(1);
    expect(walkMinutes(0.05)).toBe(1);
  });

  it('returns 1 for negative or non-finite input', () => {
    expect(walkMinutes(-3)).toBe(1);
    expect(walkMinutes(Number.NaN)).toBe(1);
    expect(walkMinutes(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('formatWalk', () => {
  it('writes the minutes as a walk', () => {
    expect(formatWalk(0.7)).toBe('11 min walk');
    expect(formatWalk(0.02)).toBe('1 min walk');
  });

  it('says nothing when there is no distance to speak of', () => {
    expect(formatWalk(null)).toBeNull();
    expect(formatWalk(undefined)).toBeNull();
    expect(formatWalk(Number.NaN)).toBeNull();
  });
});
