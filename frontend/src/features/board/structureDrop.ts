import { ApiError } from '../../api/client';

/**
 * The structure panel's half of the board's one DndContext. The board already
 * has a drag vocabulary — an idea row's grip carries `{ entryId, title }` and a
 * bundle card answers with `{ bundleId, title }` (bundleDrop.ts) — and the tree
 * must speak on the same context without colliding with it. So every structure
 * payload declares itself with `type: 'structure'`, and TripBoard's onDragEnd
 * routes on that before it ever looks for a bundle target. Ids are namespaced
 * `structure-…` too, but the DATA is what the handler trusts: ids are for
 * dnd-kit's registry (and have to be unique per occurrence — the same child
 * under two parents is two rows), the data is the contract.
 *
 * Tree drag MOVES, board drag COPIES. That asymmetry is the design: dropping an
 * idea on a bundle card adds a home, dragging a row inside the tree changes the
 * one home you grabbed it from. Which is why the drag payload names the parent
 * OCCURRENCE — `sourceParentId` — and not just the child: only the grabbed
 * occurrence's link moves, and the same child's other homes stay put.
 */

export interface StructureDragData {
  type: 'structure';
  /** The entry being moved. */
  childId: number;
  /** The parent whose link was grabbed — the one link a successful move removes. */
  sourceParentId: number;
  /** That parent's title, for the honest half-failure toast. */
  sourceParentTitle: string;
  /** EVERY current parent of the child in the graph, for the duplicate no-op. */
  parentIds: number[];
  /** The child's title, for the DragOverlay and the toasts. */
  title: string;
}

export interface StructureDropData {
  type: 'structure';
  /** The entry the row stands for — the would-be new parent. */
  targetId: number;
  title: string;
}

export function isStructureDrag(data: unknown): data is StructureDragData {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'structure' && 'childId' in data;
}

export function isStructureDrop(data: unknown): data is StructureDropData {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'structure' && 'targetId' in data;
}

export type StructureMovePlan =
  | { kind: 'noop' }
  | { kind: 'move'; addParentId: number; removeParentId: number; childId: number };

/**
 * Decide what a drop means before anything is mutated. Three drops are
 * deliberate no-ops, not errors — each is "put it where it already is":
 * dropping a row on itself, on the parent it was grabbed from, or on any OTHER
 * parent it already hangs under (a move there would silently collapse two
 * occurrences into one, destroying a link nobody aimed at). Everything else —
 * cycles included — is the server's question to answer; the client never
 * pre-validates the graph beyond what the drop itself makes obvious.
 */
export function planStructureMove(drag: StructureDragData, drop: StructureDropData): StructureMovePlan {
  if (drop.targetId === drag.childId) return { kind: 'noop' };
  if (drop.targetId === drag.sourceParentId) return { kind: 'noop' };
  if (drag.parentIds.includes(drop.targetId)) return { kind: 'noop' };
  return { kind: 'move', addParentId: drop.targetId, removeParentId: drag.sourceParentId, childId: drag.childId };
}

/** The house sentence for a write that did not land. Same words everywhere. */
export const SAVE_FAILED = "That didn't save. It's still here — try again.";

/**
 * A 422 is the server explaining itself — "would create a cycle: …" — and that
 * sentence must reach the person as written. fieldErrors holds it clean; the
 * flattened message (prefixed "base ") is the fallback. Anything else gets the
 * house save-failed line. Same reading as AppearsInEditor's.
 */
export function linkRefusalMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 422) {
    return error.fieldErrors?.base?.join(' ') ?? error.message;
  }
  return SAVE_FAILED;
}

/** The slice of a TanStack mutation this module needs — mutate with per-call
 * callbacks — so the executor is testable with two plain spies. */
export interface LinkMutator {
  mutate: (
    variables: { parentId: number; childId: number },
    options?: { onSuccess?: () => void; onError?: (error: unknown) => void },
  ) => void;
}

/**
 * Execute a move as add-then-remove, in that order and never the reverse.
 * The failure modes are asymmetric and the order is chosen so the worse one
 * cannot happen: a failed ADD leaves the old link intact and nothing has moved;
 * a failed REMOVE after a successful add leaves a copy — the safer wrong state,
 * reported honestly rather than papered over. Deleting first would open the
 * window where the child has no parent at all.
 *
 * Returns true when a move was actually attempted, false for the no-op drops.
 */
export function performStructureMove({
  drag,
  drop,
  addLink,
  removeLink,
  show,
}: {
  drag: StructureDragData;
  drop: StructureDropData;
  addLink: LinkMutator;
  removeLink: LinkMutator;
  show: (message: string, tone: 'success' | 'error') => void;
}): boolean {
  const plan = planStructureMove(drag, drop);
  if (plan.kind === 'noop') return false;

  addLink.mutate(
    { parentId: plan.addParentId, childId: plan.childId },
    {
      onSuccess: () =>
        removeLink.mutate(
          { parentId: plan.removeParentId, childId: plan.childId },
          {
            onSuccess: () => show(`Moved ${drag.title} under ${drop.title}.`, 'success'),
            onError: () =>
              show(
                `A copy of ${drag.title} landed under ${drop.title}, but removing it from ${drag.sourceParentTitle} didn't save — it's in both places for now.`,
                'error',
              ),
          },
        ),
      onError: (error) => show(linkRefusalMessage(error), 'error'),
    },
  );
  return true;
}
