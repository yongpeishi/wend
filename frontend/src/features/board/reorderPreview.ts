/**
 * Pure maths for the live insertion indicator while a plan's members are being
 * reordered — by pointer drag or by the keyboard grip.
 *
 * Everything here speaks in GAPS, not rows. A list of `length` rows has
 * `length + 1` gaps: 0 is above the first row, `length` is below the last, and
 * gap `i` is the seam directly above row `i`. The indicator is drawn on a gap,
 * and the drop is committed from a gap, so the component never has to reason
 * about "before row 2" versus "after row 1" being the same place — they are
 * one number here.
 *
 * The one wrinkle a gap model carries is that the two gaps hugging the row
 * being moved (`fromIndex` and `fromIndex + 1`) both leave the order exactly
 * as it is. This file treats that pair as a single "home" position: neither
 * draws an indicator (`isNoopInsertion`), neither fires a request
 * (`applyInsertion` hands back the same order), and the keyboard never has to
 * arrow through both of them to move one row (`stepInsertion`).
 */

/** A gap between rows: 0 = before the first row, length = after the last. */
export type InsertionIndex = number;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Upper half of the row under the pointer → the gap above it; lower half → the
 * gap below. The exact midline counts as the lower half, so a row of odd
 * height has no dead pixel row where neither branch owns it.
 *
 * A non-positive `rowHeight` — a row that has not laid out yet, or a stubbed
 * rect in a test — reads as the upper half rather than dividing by nothing.
 */
export function insertionIndexFromPointer(
  overIndex: number,
  offsetY: number,
  rowHeight: number,
): InsertionIndex {
  const index = Math.max(0, overIndex);
  if (rowHeight <= 0) return index;
  return offsetY >= rowHeight / 2 ? index + 1 : index;
}

/** The two gaps hugging the dragged row leave the order unchanged. */
export function isNoopInsertion(fromIndex: number, insertAt: InsertionIndex): boolean {
  return insertAt === fromIndex || insertAt === fromIndex + 1;
}

/**
 * Where the moved item ends up after the row it vacates closes. Gaps below the
 * origin shift up by one once the origin row is gone; gaps above it do not
 * move. This is the "N of M" number the live region reads out.
 */
export function landingIndex(fromIndex: number, insertAt: InsertionIndex): number {
  return insertAt > fromIndex ? insertAt - 1 : insertAt;
}

/**
 * New array with `items[fromIndex]` moved into the gap. Always a fresh array —
 * a noop returns a same-order copy — so callers can hand the result straight
 * to a mutation or a state setter without checking whether anything changed.
 * Out-of-range indexes are clamped rather than thrown on: a drop that lands a
 * frame after the list shrank should degrade to "nothing happened".
 */
export function applyInsertion<T>(
  items: readonly T[],
  fromIndex: number,
  insertAt: InsertionIndex,
): T[] {
  const next = items.slice();
  if (items.length === 0) return next;
  const from = clamp(fromIndex, 0, items.length - 1);
  const at = clamp(insertAt, 0, items.length);
  if (isNoopInsertion(from, at)) return next;
  const [moved] = next.splice(from, 1);
  next.splice(landingIndex(from, at), 0, moved);
  return next;
}

/**
 * Keyboard step: move the landing index by ±1, clamped to `[0, length - 1]`,
 * and express it back as a gap.
 *
 * Working in landing space rather than gap space is what collapses the two
 * noop gaps into one home position: from home, ArrowDown lands one row below
 * instead of hopping to the other noop gap and appearing to do nothing. The
 * gap chosen for a landing is the one that does not pass through the origin
 * (`landing <= fromIndex ? landing : landing + 1`), so
 * `landingIndex(fromIndex, result)` always reads back the clamped landing.
 */
export function stepInsertion(
  fromIndex: number,
  insertAt: InsertionIndex,
  direction: -1 | 1,
  length: number,
): InsertionIndex {
  if (length <= 0) return 0;
  const from = clamp(fromIndex, 0, length - 1);
  const at = clamp(insertAt, 0, length);
  const landing = clamp(landingIndex(from, at) + direction, 0, length - 1);
  return landing <= from ? landing : landing + 1;
}
