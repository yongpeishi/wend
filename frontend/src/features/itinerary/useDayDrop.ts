import { closestCenter, pointerWithin, rectIntersection, useDndMonitor, useDroppable } from '@dnd-kit/core';
import type {
  ClientRect,
  Collision,
  CollisionDetection,
  DroppableContainer,
  KeyboardCoordinateGetter,
  SensorContext,
  UniqueIdentifier,
} from '@dnd-kit/core';

/** Draggables carry this so a day knows what was dropped on it. */
export interface ItineraryDragData {
  entryId: number;
  title: string;
}

/**
 * What a drop target says about itself.
 *
 * `versionId: null` means "the day decides" — an unsplit day, or a collapsed
 * row whose columns you cannot see, so cannot be aiming at. A number is a
 * version column asking for that version by name, including
 * `UNSAVED_VERSION_ID` for the synthetic version an untouched date draws (the
 * container is what knows to leave `day_version_id` out for that one).
 */
export interface ItineraryDropData {
  day: string;
  versionId: number | null;
}

/** `(entryId, versionId)`; versionId null when the day picks the version. */
export type ItineraryDropHandler = (entryId: number, versionId: number | null) => void;

export function dayDroppableId(day: string): string {
  return `itinerary-day-${day}`;
}

export function versionDroppableId(day: string, versionId: number): string {
  return `${dayDroppableId(day)}-version-${versionId}`;
}

/**
 * One itinerary drop target — a day, or one version column inside a day.
 *
 * `@dnd-kit` is the project's stack choice, so a drop is not a DOM event on
 * this element — it is reported by the enclosing `DndContext`. That means
 * **anything using this hook must be rendered inside a `<DndContext>`**;
 * `useDndMonitor` throws without one. The container owns that context, and so
 * do the tests.
 *
 * The monitor fires only when `over` is this exact target, which is how a day
 * and the columns inside it stay mutually exclusive: whichever one the context
 * resolved to is the only one that hears the drop. Which one that is, is
 * `itineraryCollisionDetection`'s job.
 *
 * Dragging is the accelerator, never the only route: the rail's ⋯ menu places
 * the same thing on the same day with a pointer or a keyboard alone, and a
 * split day's "+ add to Version B" does it per version.
 */
function useItineraryDrop(id: string, data: ItineraryDropData, onDropItem?: ItineraryDropHandler) {
  const { setNodeRef, isOver } = useDroppable({ id, data });

  useDndMonitor({
    onDragEnd({ over, active }) {
      if (!onDropItem || over?.id !== id) return;
      const dragged = active.data.current as Partial<ItineraryDragData> | undefined;
      if (typeof dragged?.entryId === 'number') onDropItem(dragged.entryId, data.versionId);
    },
  });

  // `dropId` goes on the element as `data-drop-id`. It names the target in the
  // DOM, which is the only handle anything outside React — a browser check
  // aiming a drag, a test laying out geometry — has on it.
  return { setNodeRef, isOver, dropId: id };
}

/** Makes one whole day a drop target. The version is the day's to choose. */
export function useDayDrop(day: string, onDropItem?: ItineraryDropHandler) {
  return useItineraryDrop(dayDroppableId(day), { day, versionId: null }, onDropItem);
}

/** Makes one version column of a split day a target in its own right. */
export function useVersionDrop(day: string, versionId: number, onDropItem?: ItineraryDropHandler) {
  return useItineraryDrop(versionDroppableId(day, versionId), { day, versionId }, onDropItem);
}

/** The drop data off a container, or null if it is not an itinerary target. */
function dropDataOf(container: DroppableContainer | undefined): ItineraryDropData | null {
  const data = container?.data.current as Partial<ItineraryDropData> | undefined;
  if (!data || typeof data.day !== 'string') return null;
  // versionId 0 is UNSAVED_VERSION_ID, a real answer — only a missing one is null.
  return { day: data.day, versionId: typeof data.versionId === 'number' ? data.versionId : null };
}

/**
 * Which target a drag is over.
 *
 * Two readings, because a keyboard drag has no pointer at all: with one, what
 * is literally under the cursor wins, falling back to rect overlap for the
 * moment the cursor has run off the edge of every target while the card it is
 * carrying has not. Without one, the drag sits wherever
 * `itineraryKeyboardCoordinates` parked it, and nearest-centre is the reading
 * that always resolves to exactly the target it was parked on.
 *
 * Then the innermost target wins. A split day is a drop target that *contains*
 * drop targets, and the enclosing day is the bigger, easier thing to hit — so
 * left alone it swallows every drop aimed at a column and the day resolves to
 * Version A, which is the whole of feedback 014#2. This does not blanket-prefer
 * version targets (that would let a split day elsewhere on the page steal a
 * drop meant for an unsplit one): it only promotes a version column over *its
 * own day*, when both are in the running.
 */
export const itineraryCollisionDetection: CollisionDetection = (args) => {
  const byId = new Map<UniqueIdentifier, DroppableContainer>(
    args.droppableContainers.map((container) => [container.id, container]),
  );
  const collisions = args.pointerCoordinates ? underPointer(args) : closestCenter(args);
  return innermostFirst(collisions, byId);
};

function underPointer(args: Parameters<CollisionDetection>[0]): Collision[] {
  const under = pointerWithin(args);
  return under.length > 0 ? under : rectIntersection(args);
}

function innermostFirst(
  collisions: Collision[],
  byId: Map<UniqueIdentifier, DroppableContainer>,
): Collision[] {
  const [best] = collisions;
  if (!best) return collisions;

  const bestData = dropDataOf(byId.get(best.id));
  // Not one of ours, or already a column: nothing encloses it.
  if (!bestData || bestData.versionId !== null) return collisions;

  const inner = collisions.find((collision) => {
    const data = dropDataOf(byId.get(collision.id));
    return data !== null && data.versionId !== null && data.day === bestData.day;
  });

  return inner ? [inner, ...collisions.filter((collision) => collision !== inner)] : collisions;
}

/** Forward through the targets, back through them. Nothing else moves a drag. */
const STEP: Record<string, number> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

interface KeyboardTarget {
  id: UniqueIdentifier;
  rect: ClientRect;
  data: ItineraryDropData;
}

/**
 * The arrow keys, for a drag that is being carried by the keyboard.
 *
 * `@dnd-kit`'s own getter nudges the drag 25px per press, which on this screen
 * means a dozen presses to cross from the rail to a day and a dozen more to
 * reach the second column of a split one. This walks the drop targets
 * themselves instead: one press, one target, in the order they are read down
 * the page. Every version column is therefore reachable, and reachable in a
 * countable number of presses — which is what makes a split day placeable
 * without a mouse at all.
 *
 * It parks the drag centred on the target, so nearest-centre resolves to that
 * target and nothing else.
 */
export const itineraryKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const step = STEP[event.code];
  if (step === undefined) return;

  const targets = keyboardTargets(context.droppableContainers.toArray(), context.droppableRects);
  // Before the context has measured anything there is nowhere to go, and the
  // page should still scroll rather than swallow the key.
  if (targets.length === 0) return;

  event.preventDefault();

  const here = context.over ? targets.findIndex((target) => target.id === context.over?.id) : -1;
  const next =
    here === -1
      ? step > 0
        ? 0
        : targets.length - 1
      : Math.min(targets.length - 1, Math.max(0, here + step));

  const { rect } = targets[next];
  const dragged = context.collisionRect;
  return {
    x: rect.left + rect.width / 2 - (dragged ? dragged.width / 2 : 0),
    y: rect.top + rect.height / 2 - (dragged ? dragged.height / 2 : 0),
  };
};

/**
 * The targets the arrow keys walk, in reading order.
 *
 * A split day registers both the day and each of its columns. Stopping on the
 * day would be stopping on "Version A by default" one press before Version A
 * itself, so wherever a day's columns are on screen the day itself drops out of
 * the walk. An unsplit day, and a collapsed row, are the only target they have.
 */
function keyboardTargets(
  containers: DroppableContainer[],
  rects: SensorContext['droppableRects'],
): KeyboardTarget[] {
  const targets: KeyboardTarget[] = [];

  for (const container of containers) {
    if (container.disabled) continue;
    const data = dropDataOf(container);
    const rect = rects.get(container.id);
    if (!data || !rect) continue;
    targets.push({ id: container.id, rect, data });
  }

  const withColumns = new Set(
    targets.filter((target) => target.data.versionId !== null).map((target) => target.data.day),
  );

  return targets
    .filter((target) => target.data.versionId !== null || !withColumns.has(target.data.day))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
}
