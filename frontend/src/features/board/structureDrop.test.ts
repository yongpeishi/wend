import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { isStructureDrag, isStructureDrop, performStructureMove, planStructureMove } from './structureDrop';
import type { LinkMutator, StructureDragData, StructureDropData } from './structureDrop';

/**
 * The move semantics, tested where they live: pure planning plus an executor
 * that takes its two mutations as plain objects. What matters here is ORDER
 * and what each failure leaves behind — the panel tests cover the rendering,
 * TripBoard's handler is a straight route into this.
 */

function drag(overrides: Partial<StructureDragData> = {}): StructureDragData {
  return {
    type: 'structure',
    childId: 5,
    sourceParentId: 4,
    sourceParentTitle: 'Nishiki market crawl',
    parentIds: [4, 9],
    title: 'Coffee at Weekenders',
    ...overrides,
  };
}

function drop(overrides: Partial<StructureDropData> = {}): StructureDropData {
  return { type: 'structure', targetId: 7, title: 'A night out in Pontocho', ...overrides };
}

/** A mutator whose mutate() resolves per the script: 'ok' fires onSuccess,
 * anything else is handed to onError as the error. */
function mutator(outcome: 'ok' | Error): LinkMutator & { mutate: ReturnType<typeof vi.fn> } {
  return {
    mutate: vi.fn((_variables, callbacks) => {
      if (outcome === 'ok') callbacks?.onSuccess?.();
      else callbacks?.onError?.(outcome);
    }),
  };
}

describe('planStructureMove — what a drop means', () => {
  it('plans add-under-target, remove-from-grabbed-parent for a real move', () => {
    expect(planStructureMove(drag(), drop())).toEqual({
      kind: 'move',
      addParentId: 7,
      removeParentId: 4,
      childId: 5,
    });
  });

  it('dropping a row on itself is a no-op', () => {
    expect(planStructureMove(drag(), drop({ targetId: 5 }))).toEqual({ kind: 'noop' });
  });

  it('dropping on the parent it was grabbed from is a no-op', () => {
    expect(planStructureMove(drag(), drop({ targetId: 4 }))).toEqual({ kind: 'noop' });
  });

  it('dropping on any OTHER parent it already hangs under is a no-op, not a merge', () => {
    // 9 is a parent of the child but not the grabbed occurrence's parent — a
    // "move" there would collapse two occurrences into one.
    expect(planStructureMove(drag(), drop({ targetId: 9 }))).toEqual({ kind: 'noop' });
  });
});

describe('performStructureMove — add first, remove only on success', () => {
  it('adds under the target, then removes the grabbed link, then says it moved', () => {
    const addLink = mutator('ok');
    const removeLink = mutator('ok');
    const show = vi.fn();

    const attempted = performStructureMove({ drag: drag(), drop: drop(), addLink, removeLink, show });

    expect(attempted).toBe(true);
    expect(addLink.mutate).toHaveBeenCalledWith({ parentId: 7, childId: 5 }, expect.anything());
    expect(removeLink.mutate).toHaveBeenCalledWith({ parentId: 4, childId: 5 }, expect.anything());
    // Order: the add strictly before the remove.
    expect(addLink.mutate.mock.invocationCallOrder[0]).toBeLessThan(removeLink.mutate.mock.invocationCallOrder[0]);
    expect(show).toHaveBeenCalledWith('Moved Coffee at Weekenders under A night out in Pontocho.', 'success');
  });

  it('a failed add leaves the old link alone — no remove is ever attempted', () => {
    const addLink = mutator(new ApiError(500, 'boom'));
    const removeLink = mutator('ok');
    const show = vi.fn();

    performStructureMove({ drag: drag(), drop: drop(), addLink, removeLink, show });

    expect(removeLink.mutate).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith("That didn't save. It's still here — try again.", 'error');
  });

  it('a 422 on the add surfaces the server’s own sentence, not the generic line', () => {
    const refusal = 'would create a cycle: Coffee at Weekenders → A night out in Pontocho → Coffee at Weekenders';
    const addLink = mutator(new ApiError(422, `base ${refusal}`, { base: [refusal] }));
    const removeLink = mutator('ok');
    const show = vi.fn();

    performStructureMove({ drag: drag(), drop: drop(), addLink, removeLink, show });

    expect(removeLink.mutate).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(refusal, 'error');
  });

  it('a failed remove after a successful add owns up to the copy it left', () => {
    const addLink = mutator('ok');
    const removeLink = mutator(new ApiError(500, 'boom'));
    const show = vi.fn();

    performStructureMove({ drag: drag(), drop: drop(), addLink, removeLink, show });

    expect(show).toHaveBeenCalledWith(
      "A copy of Coffee at Weekenders landed under A night out in Pontocho, but removing it from Nishiki market crawl didn't save — it's in both places for now.",
      'error',
    );
  });

  it('the no-op drops touch nothing and say nothing', () => {
    const addLink = mutator('ok');
    const removeLink = mutator('ok');
    const show = vi.fn();

    for (const targetId of [5, 4, 9]) {
      expect(performStructureMove({ drag: drag(), drop: drop({ targetId }), addLink, removeLink, show })).toBe(false);
    }

    expect(addLink.mutate).not.toHaveBeenCalled();
    expect(removeLink.mutate).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });
});

describe('the payload guards TripBoard routes on', () => {
  it('recognise structure payloads and nothing else', () => {
    expect(isStructureDrag(drag())).toBe(true);
    expect(isStructureDrop(drop())).toBe(true);
    // The board's own payloads must fall through to the bundle path.
    expect(isStructureDrag({ entryId: 2, title: 'Nanzen-ji' })).toBe(false);
    expect(isStructureDrop({ bundleId: 4, title: 'Nishiki market crawl' })).toBe(false);
    expect(isStructureDrag(undefined)).toBe(false);
    expect(isStructureDrop(null)).toBe(false);
    // A drag datum is not a drop datum, whatever its type field says.
    expect(isStructureDrop(drag())).toBe(false);
    expect(isStructureDrag(drop())).toBe(false);
  });
});
