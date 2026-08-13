import { useDndMonitor, useDroppable } from '@dnd-kit/core';

/** Draggables carry this so a day knows what was dropped on it. */
export interface ItineraryDragData {
  entryId: number;
  title: string;
}

export function dayDroppableId(day: string): string {
  return `itinerary-day-${day}`;
}

/**
 * Makes one day a drop target for the rail.
 *
 * `@dnd-kit` is the project's stack choice, so a drop is not a DOM event on
 * this element — it is reported by the enclosing `DndContext`. That means
 * **anything using this hook must be rendered inside a `<DndContext>`**;
 * `useDndMonitor` throws without one. The container owns that context, and so
 * do the tests.
 *
 * Dragging is the accelerator, never the only route: the rail's ⋯ menu places
 * the same thing on the same day with a pointer or a keyboard alone.
 */
export function useDayDrop(day: string, onDropItem?: (entryId: number) => void) {
  const id = dayDroppableId(day);
  const { setNodeRef, isOver } = useDroppable({ id, data: { day } });

  useDndMonitor({
    onDragEnd({ over, active }) {
      if (!onDropItem || over?.id !== id) return;
      const data = active.data.current as Partial<ItineraryDragData> | undefined;
      if (typeof data?.entryId === 'number') onDropItem(data.entryId);
    },
  });

  return { setNodeRef, isOver };
}
