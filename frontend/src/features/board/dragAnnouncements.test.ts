import { describe, expect, it } from 'vitest';
import type { Active, Over } from '@dnd-kit/core';
import { BOARD_DRAG_ANNOUNCEMENTS, BOARD_DRAG_INSTRUCTIONS } from './dragAnnouncements';

/**
 * The sentences are tested here as plain functions of the drag data, because
 * that is what they are — TripBoard.test.tsx separately proves the ones jsdom
 * can reach flow out through dnd-kit's live region. The casts mirror how the
 * real objects arrive: dnd-kit types `data.current` as anything, and the
 * shapes are the contract IdeaRow and BundleCard write (see bundleDrop.ts).
 */
function lifted(title: string): Active {
  return { id: 'idea-1', data: { current: { entryId: 1, title } } } as unknown as Active;
}

function overPlan(title?: string): Over {
  return { id: 'bundle-2', data: { current: { bundleId: 2, title } } } as unknown as Over;
}

/** A droppable that is not a plan — no bundleId, so no drop will be honoured. */
function overSomethingElse(): Over {
  return { id: 'elsewhere', data: { current: {} } } as unknown as Over;
}

describe('the board drag announcements', () => {
  it('picks the idea up by its title, not its draggable id', () => {
    expect(BOARD_DRAG_ANNOUNCEMENTS.onDragStart({ active: lifted('Nanzen-ji') })).toBe('Picked up Nanzen-ji.');
  });

  it('names the plan under the drag', () => {
    expect(
      BOARD_DRAG_ANNOUNCEMENTS.onDragOver({ active: lifted('Nanzen-ji'), over: overPlan('Nishiki market crawl') }),
    ).toBe('Nanzen-ji is over the plan Nishiki market crawl.');
  });

  it('says when the drag is over nothing that takes drops', () => {
    expect(BOARD_DRAG_ANNOUNCEMENTS.onDragOver({ active: lifted('Nanzen-ji'), over: null })).toBe(
      'Nanzen-ji is over no plan.',
    );
    // A droppable without a bundleId is the same sentence: onDragEnd would
    // refuse it, so the commentary must not promise it.
    expect(BOARD_DRAG_ANNOUNCEMENTS.onDragOver({ active: lifted('Nanzen-ji'), over: overSomethingElse() })).toBe(
      'Nanzen-ji is over no plan.',
    );
  });

  it('announces a drop on a plan as the add it performs', () => {
    expect(
      BOARD_DRAG_ANNOUNCEMENTS.onDragEnd({ active: lifted('Nanzen-ji'), over: overPlan('Nishiki market crawl') }),
    ).toBe('Added Nanzen-ji to the plan Nishiki market crawl.');
  });

  it('says a drop that landed nowhere changed nothing', () => {
    expect(BOARD_DRAG_ANNOUNCEMENTS.onDragEnd({ active: lifted('Nanzen-ji'), over: null })).toBe(
      'Nanzen-ji was dropped. Nothing changed.',
    );
  });

  it('says a cancelled move was cancelled', () => {
    expect(BOARD_DRAG_ANNOUNCEMENTS.onDragCancel({ active: lifted('Nanzen-ji'), over: null })).toBe(
      'Moving Nanzen-ji was cancelled.',
    );
  });

  it('falls back to plain words when the drag data is missing, never to an id', () => {
    const bare = { id: 'idea-9', data: { current: undefined } } as unknown as Active;
    expect(BOARD_DRAG_ANNOUNCEMENTS.onDragStart({ active: bare })).toBe('Picked up The idea.');
    expect(
      BOARD_DRAG_ANNOUNCEMENTS.onDragEnd({
        active: lifted('Nanzen-ji'),
        over: { id: 'bundle-9', data: { current: { bundleId: 9 } } } as unknown as Over,
      }),
    ).toBe('Added Nanzen-ji to the plan the plan.');
  });

  it('teaches the whole keyboard gesture: space, arrows, space, escape', () => {
    const said = BOARD_DRAG_INSTRUCTIONS.draggable.toLowerCase();
    expect(said).toContain('space to lift');
    expect(said).toContain('arrow keys');
    expect(said).toContain('space again to drop');
    expect(said).toContain('escape');
  });
});
