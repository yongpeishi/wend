import { describe, expect, it } from 'vitest';
import {
  applyInsertion,
  insertionIndexFromPointer,
  isNoopInsertion,
  landingIndex,
  stepInsertion,
} from './reorderPreview';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

describe('insertionIndexFromPointer', () => {
  it.each([
    // [overIndex, offsetY, rowHeight, expected gap]
    [0, 0, 40, 0], // top edge → above
    [2, 10, 40, 2], // upper half → above
    [2, 19, 40, 2], // last pixel of the upper half
    [2, 20, 40, 3], // exact midline counts as the lower half
    [2, 39, 40, 3], // lower half → below
    [2, 40, 40, 3], // bottom edge → below
    [1, 20, 41, 1], // odd height: 20 < 20.5 is still the upper half
    [1, 21, 41, 2],
  ])('over %i at %ipx of %ipx → gap %i', (overIndex, offsetY, rowHeight, expected) => {
    expect(insertionIndexFromPointer(overIndex, offsetY, rowHeight)).toBe(expected);
  });

  it('treats a row with no height as the upper half', () => {
    expect(insertionIndexFromPointer(2, 10, 0)).toBe(2);
    expect(insertionIndexFromPointer(2, 10, -5)).toBe(2);
  });

  it('never returns a negative gap', () => {
    expect(insertionIndexFromPointer(-1, 0, 40)).toBe(0);
  });
});

describe('isNoopInsertion', () => {
  it.each([
    [1, 1, true], // the gap above the origin
    [1, 2, true], // the gap below it
    [1, 0, false],
    [1, 3, false],
    [0, 0, true],
    [0, 1, true],
    [0, 2, false],
  ])('from %i into gap %i → %s', (fromIndex, insertAt, expected) => {
    expect(isNoopInsertion(fromIndex, insertAt)).toBe(expected);
  });
});

describe('landingIndex', () => {
  it.each([
    // moving up: gaps above the origin land where they are
    [3, 0, 0],
    [3, 2, 2],
    // home: both gaps land back on the origin
    [3, 3, 3],
    [3, 4, 3],
    // moving down: the vacated row closes, so gaps below shift up by one
    [3, 5, 4],
    [3, 6, 5],
    [0, 4, 3],
  ])('from %i into gap %i lands at %i', (fromIndex, insertAt, expected) => {
    expect(landingIndex(fromIndex, insertAt)).toBe(expected);
  });
});

describe('applyInsertion', () => {
  const items = ['a', 'b', 'c', 'd'];

  it.each([
    ['first → last', 0, 4, ['b', 'c', 'd', 'a']],
    ['last → first', 3, 0, ['d', 'a', 'b', 'c']],
    ['middle → one row up', 2, 1, ['a', 'c', 'b', 'd']],
    ['middle → one row down', 1, 3, ['a', 'c', 'b', 'd']],
    ['first → middle', 0, 2, ['b', 'a', 'c', 'd']],
    ['last → middle', 3, 2, ['a', 'b', 'd', 'c']],
  ])('%s', (_label, fromIndex, insertAt, expected) => {
    expect(applyInsertion(items, fromIndex, insertAt)).toEqual(expected);
  });

  it.each([
    [1, 1],
    [1, 2],
  ])('a noop (from %i into gap %i) returns a fresh copy in the same order', (fromIndex, insertAt) => {
    const result = applyInsertion(items, fromIndex, insertAt);
    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it('never mutates its input', () => {
    const before = items.slice();
    applyInsertion(items, 0, 4);
    expect(items).toEqual(before);
  });

  it('clamps indexes that have fallen out of range', () => {
    expect(applyInsertion(items, 0, 99)).toEqual(['b', 'c', 'd', 'a']);
    expect(applyInsertion(items, 99, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(applyInsertion(items, -1, 1)).toEqual(items);
  });

  it('copies an empty list', () => {
    const empty: string[] = [];
    const result = applyInsertion(empty, 0, 0);
    expect(result).toEqual([]);
    expect(result).not.toBe(empty);
  });
});

describe('stepInsertion', () => {
  // Three rows, moving the middle one (index 1). Home is gaps 1 and 2.
  const from = 1;
  const n = 3;

  it.each([
    // [insertAt, direction, expected gap, expected landing]
    ['home (upper gap) + down', 1, 1, 3, 2],
    ['home (lower gap) + down', 2, 1, 3, 2],
    ['home (upper gap) + up', 1, -1, 0, 0],
    ['home (lower gap) + up', 2, -1, 0, 0],
    ['above + down crosses home in one step', 0, 1, 1, 1],
    ['below + up crosses home in one step', 3, -1, 1, 1],
  ] as const)('%s', (_label, insertAt, direction, expectedGap, expectedLanding) => {
    const result = stepInsertion(from, insertAt, direction, n);
    expect(result).toBe(expectedGap);
    expect(landingIndex(from, result)).toBe(expectedLanding);
  });

  it('clamps at the top', () => {
    expect(stepInsertion(from, 0, -1, n)).toBe(0);
    expect(stepInsertion(0, 0, -1, n)).toBe(0);
  });

  it('clamps at the bottom', () => {
    expect(stepInsertion(from, 3, 1, n)).toBe(3);
    // The last row stepping down stays home; home normalises to its upper gap.
    const stayed = stepInsertion(2, 3, 1, n);
    expect(stayed).toBe(2);
    expect(isNoopInsertion(2, stayed)).toBe(true);
  });

  it('is inert on a list of one or none', () => {
    expect(stepInsertion(0, 0, 1, 1)).toBe(0);
    expect(stepInsertion(0, 0, -1, 1)).toBe(0);
    expect(stepInsertion(0, 0, 1, 0)).toBe(0);
  });

  it('round-trips: the landing after a step is the previous landing ±1, clamped', () => {
    const length = 5;
    for (let fromIndex = 0; fromIndex < length; fromIndex += 1) {
      for (let insertAt = 0; insertAt <= length; insertAt += 1) {
        for (const direction of [-1, 1] as const) {
          const expected = clamp(landingIndex(fromIndex, insertAt) + direction, 0, length - 1);
          const stepped = stepInsertion(fromIndex, insertAt, direction, length);
          expect(landingIndex(fromIndex, stepped)).toBe(expected);
          expect(stepped).toBeGreaterThanOrEqual(0);
          expect(stepped).toBeLessThanOrEqual(length);
        }
      }
    }
  });
});
