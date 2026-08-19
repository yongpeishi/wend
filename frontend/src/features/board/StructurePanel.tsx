import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useEntryGraph } from '../../api';
import type { Entry } from '../../api/types';
import { QueryGate } from '../../components/QueryGate';
import { useCanEdit } from '../../auth/TripRoleContext';
import { buildTreeFromGraph } from './graphTree';
import type { GraphTree } from './graphTree';
import type { StructureDragData, StructureDropData } from './structureDrop';
import { StructureRowMenu } from './StructureRowMenu';
import styles from './StructurePanel.module.css';

export interface StructurePanelProps {
  trip: Entry;
  /** Opens the entry a row names — the board's own setEditingId, so the same
   * detail dialog arrives whichever half of the screen asked for it. */
  onOpenEntry: (id: number) => void;
}

/**
 * The trip's shape, as a read-only disclosure tree: everything hanging under
 * the trip, bundles included, exactly as the links have it. This is the
 * structural overview during planning — the board's two columns show WHAT the
 * trip is made of; this panel shows how it hangs together.
 *
 * One request. The graph query here is the same key `useBundleMembers` already
 * holds for the bundle rail, so opening the panel costs no network call of its
 * own — TanStack Query hands both readers one cache entry.
 *
 * Entries form a DAG, not a tree: a child with several parents renders once
 * under EACH expanded parent, on purpose — that repetition IS the fact the
 * panel exists to show, and each occurrence says where else it lives (see
 * duplicateLine). The visited-path guard in TreeNode is safety only: the
 * backend rejects cyclic links, so a well-formed response never trips it.
 *
 * No longer read-only. For an editor, every row is now three things at once:
 * a draggable (the grip — dragging a row onto another row MOVES it there,
 * one occurrence's link at a time), a droppable (the row IS the target "put
 * it under me", the root row included, which is how something comes back to
 * the top level), and a ⋯ menu carrying the pointer-free verbs — the copy
 * path and "Send to schedule". The drag rides the BOARD's DndContext: this
 * panel registers its rows there, TripBoard's onDragEnd routes structure
 * payloads to structureDrop.ts, and the board's own idea→bundle drags keep
 * their lane because both sides type their data (see structureDrop.ts).
 *
 * A viewer keeps exactly the slice-3 panel: `useCanEdit()` gates the grip,
 * the menu, and both dnd registrations — and the board's NO_SENSORS has
 * already closed the DndContext above us anyway.
 */
export function StructurePanel({ trip, onOpenEntry }: StructurePanelProps) {
  const graphQuery = useEntryGraph(trip.id, { tripId: trip.id });
  const tree = useMemo(() => (graphQuery.data ? buildTreeFromGraph(graphQuery.data) : null), [graphQuery.data]);
  const canEdit = useCanEdit();

  return (
    <nav aria-label="Trip structure" className={styles.tree}>
      <QueryGate
        query={graphQuery}
        loadingLabel="Reading the trip's structure"
        errorMessage="The structure didn't load. Nothing is lost — every idea and bundle is still on the board."
      >
        {tree && !tree.root.archived_at && (
          <TreeNode
            tree={tree}
            trip={trip}
            entry={tree.root}
            depth={0}
            path={EMPTY_PATH}
            parentId={null}
            canEdit={canEdit}
            onOpenEntry={onOpenEntry}
          />
        )}
      </QueryGate>
    </nav>
  );
}

const EMPTY_PATH: number[] = [];

/** Direct children, minus anything set aside — an archived entry and its whole
 * subtree stay out of the panel, the same rule the board's columns apply. */
function visibleChildren(tree: GraphTree, id: number): Entry[] {
  return tree.childrenOf(id).filter((child) => !child.archived_at);
}

/**
 * The "also under …" chip for one OCCURRENCE of a shared node. Reads the other
 * parents — everyone but the parent this occurrence hangs under — so each copy
 * points at its siblings' homes rather than restating its own. Past two parents
 * the list of titles stops being a chip and becomes a paragraph, so it
 * collapses to a count.
 */
function duplicateLine(tree: GraphTree, id: number, parentId: number | null): string | null {
  const count = tree.parentCount.get(id) ?? 0;
  if (count <= 1) return null;
  if (count > 2) return `in ${count} places`;
  const others = tree.parentsOf(id).filter((parent) => parent.id !== parentId);
  if (others.length === 0) return null;
  return `also under ${others.map((parent) => parent.title).join(', ')}`;
}

/** "+2", "0", "-1" — the same explicit-plus convention as IdeaRow's score. */
function formatScore(total: number): string {
  return `${total > 0 ? '+' : ''}${total}`;
}

/**
 * One occurrence of one entry. Expansion is per-occurrence local state — the
 * same node under two parents discloses independently, because each occurrence
 * is its own place in the reading.
 *
 * Default posture: the root and its direct children start open, so the panel
 * comes up showing the trip's first two levels (the trip, its ideas and
 * bundles, and each bundle's members) — the structural overview — while
 * anything deeper starts folded and is one click away.
 */
function TreeNode({
  tree,
  trip,
  entry,
  depth,
  path,
  parentId,
  canEdit,
  onOpenEntry,
}: {
  tree: GraphTree;
  trip: Entry;
  entry: Entry;
  depth: number;
  /** Ancestor ids of this occurrence — the visited-path guard. */
  path: number[];
  parentId: number | null;
  canEdit: boolean;
  onOpenEntry: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  // Safety only: stop descending if this node is already an ancestor of itself
  // on the current path. The backend refuses cyclic links, so this should never
  // fire on real data — but a walker without it would loop forever if it did.
  const onPath = path.includes(entry.id);
  const kids = onPath ? [] : visibleChildren(tree, entry.id);
  const hasChildren = kids.length > 0;
  const also = duplicateLine(tree, entry.id, parentId);

  // dnd-kit ids must be unique, and "this entry" is not unique here — a shared
  // child is on screen once per parent, and a shared PARENT repeats its whole
  // subtree. The occurrence's path is the one thing no two rows share, so it is
  // the id; the meaning travels in `data`, which is all the drop handler reads.
  const occurrenceKey = [...path, entry.id].join('-');
  const isRoot = parentId === null;

  const dragData: StructureDragData = {
    type: 'structure',
    childId: entry.id,
    sourceParentId: parentId ?? -1,
    sourceParentTitle: (parentId !== null && tree.entryById.get(parentId)?.title) || '',
    parentIds: tree.parentsOf(entry.id).map((parent) => parent.id),
    title: entry.title,
  };
  // The root cannot be moved — it is what everything else moves relative to.
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `structure-drag-${occurrenceKey}`,
    data: dragData,
    disabled: !canEdit || isRoot,
  });

  // Every row is a target, the root included — dropping on the root row is how
  // an entry comes back to the top level. Disabled for a viewer the same way
  // BundleCard's droppable is: dnd-kit resolves drops against every registered
  // droppable, and styling alone would not stop it.
  const dropData: StructureDropData = { type: 'structure', targetId: entry.id, title: entry.title };
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `structure-drop-${occurrenceKey}`,
    data: dropData,
    disabled: !canEdit,
  });

  return (
    <div>
      {/* One flex strip per row: grip, chevron, then the row's words (title
          line, and under it the "also under" report when there is one), then
          the ⋯ menu holding the row's pointer-free verbs at the far end. The
          words block is the only flexible resident — everything else is a
          fixed-size icon, so the title is what a narrow pane spends its width
          on. */}
      <div
        ref={setDropRef}
        className={[styles.row, isOver ? styles.rowOver : ''].filter(Boolean).join(' ')}
        style={{ paddingLeft: depth * 16 }}
        data-dragging={isDragging || undefined}
      >
        {canEdit && !isRoot && (
          <button
            type="button"
            ref={setDragRef}
            {...listeners}
            {...attributes}
            className={styles.handle}
            aria-label={`Move ${entry.title}`}
          >
            <GripVertical size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}

        {hasChildren ? (
          <button
            type="button"
            className={styles.disclosure}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${entry.title}` : `Expand ${entry.title}`}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className={styles.disclosureSpacer} aria-hidden="true" />
        )}

        {/* The row's words, stacked: the title line, then — when this
            occurrence lives elsewhere too — the "also under" report on a line
            of its own. Stacking is what stops the report and the title fighting
            over one run of pixels; it is the same words-in-a-column shape
            IdeaRow's `.text` uses. */}
        <div className={styles.main}>
          <div className={styles.titleLine}>
            {/* The same 7px mark BundleCard puts on a member: colour as a redundant
                cue, with a visually-hidden phrase carrying the fact in words. Only
                drawn when true — this panel says "on the schedule", not "waiting". */}
            {entry.scheduled && (
              <>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.srOnly}>On the schedule:</span>
              </>
            )}

            {/* The title opens the entry; only the chevron discloses. */}
            <button type="button" className={styles.title} onClick={() => onOpenEntry(entry.id)}>
              {entry.title}
            </button>

            {entry.kind === 'bundle' && <span className={styles.kindBadge}>Bundle</span>}

            {entry.vote_tally.count > 0 && (
              <span className={styles.score} title="Everyone's votes added up, from +2 to -2 each">
                {formatScore(entry.vote_tally.total)}
              </span>
            )}
          </div>

          {/* Muted text, not a control: it reports where else this one lives. */}
          {also && <span className={styles.also}>{also}</span>}
        </div>

        {/* The row's other verbs — the copy path and the schedule path. Not on
            the root: the trip is the frame, not a thing to re-file or place on
            its own schedule. A viewer gets no ⋯ at all, same as IdeaRow. */}
        {canEdit && !isRoot && <StructureRowMenu entry={entry} tree={tree} trip={trip} />}
      </div>

      {expanded && hasChildren && (
        <div>
          {kids.map((child, index) => (
            <TreeNode
              key={`${child.id}-${index}`}
              tree={tree}
              trip={trip}
              entry={child}
              depth={depth + 1}
              path={[...path, entry.id]}
              parentId={entry.id}
              canEdit={canEdit}
              onOpenEntry={onOpenEntry}
            />
          ))}
        </div>
      )}
    </div>
  );
}
