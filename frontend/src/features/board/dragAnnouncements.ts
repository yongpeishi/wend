import type { Active, Announcements, Over, ScreenReaderInstructions } from '@dnd-kit/core';
import type { BundleDropData } from './bundleDrop';

/**
 * What a screen reader hears while an idea is being dragged on the board.
 *
 * Left alone, dnd-kit announces its own bookkeeping — "Draggable item
 * idea-1022 was dropped over droppable area bundle-1030" — internal ids and
 * borrowed vocabulary, neither of which anyone chose to say. These sentences
 * say the same events in the board's words: ideas, picked up and added to
 * plans. They read both sides of the drag contract — the draggable's
 * `{entryId, title}` (written by IdeaRow) and the droppable's BundleDropData
 * (written by BundleCard) — so like bundleDrop.ts they live in a file of
 * their own rather than inside the route that merely wires them up, which
 * also keeps every sentence unit-testable without mounting the board.
 */

/** The title of the idea in the air, read off the draggable's own data. */
function ideaTitle(active: Active): string {
  const data = active.data.current as { entryId: number; title: string } | undefined;
  return data?.title ?? 'The idea';
}

/**
 * The plan under the drag, or null when whatever is under it takes no drops.
 * The same narrowing onDragEnd does before it writes: a droppable without a
 * `bundleId` is not a plan, and announcing it as one would promise a link the
 * handler will never make.
 */
function planTitle(over: Over | null): string | null {
  const data = over?.data.current as BundleDropData | undefined;
  if (!data || data.bundleId === undefined) return null;
  return data.title ?? 'the plan';
}

export const BOARD_DRAG_ANNOUNCEMENTS: Announcements = {
  onDragStart: ({ active }) => `Picked up ${ideaTitle(active)}.`,
  onDragOver: ({ active, over }) => {
    const plan = planTitle(over);
    return plan ? `${ideaTitle(active)} is over the plan ${plan}.` : `${ideaTitle(active)} is over no plan.`;
  },
  onDragEnd: ({ active, over }) => {
    const plan = planTitle(over);
    return plan
      ? `Added ${ideaTitle(active)} to the plan ${plan}.`
      : `${ideaTitle(active)} was dropped. Nothing changed.`;
  },
  onDragCancel: ({ active }) => `Moving ${ideaTitle(active)} was cancelled.`,
};

/**
 * What a screen reader is told about the grip before anything moves — the
 * whole keyboard gesture, in the same words the announcements above will use
 * once it starts.
 */
export const BOARD_DRAG_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Press space to lift the idea, then the arrow keys to carry it over a plan. Press space again to drop it there, or escape to put it back.',
};
