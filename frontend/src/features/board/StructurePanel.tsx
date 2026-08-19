import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEntryGraph } from '../../api';
import type { Entry } from '../../api/types';
import { QueryGate } from '../../components/QueryGate';
import { buildTreeFromGraph } from './graphTree';
import type { GraphTree } from './graphTree';
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
 * Read-only in this slice: rows open the entry, chevrons disclose, and nothing
 * here edits. The row's markup is a flat flex strip so a later slice can
 * prepend a drag handle and append a ⋯ menu button without restructuring.
 */
export function StructurePanel({ trip, onOpenEntry }: StructurePanelProps) {
  const graphQuery = useEntryGraph(trip.id, { tripId: trip.id });
  const tree = useMemo(() => (graphQuery.data ? buildTreeFromGraph(graphQuery.data) : null), [graphQuery.data]);

  return (
    <nav aria-label="Trip structure" className={styles.tree}>
      <QueryGate
        query={graphQuery}
        loadingLabel="Reading the trip's structure"
        errorMessage="The structure didn't load. Nothing is lost — every idea and bundle is still on the board."
      >
        {tree && !tree.root.archived_at && (
          <TreeNode tree={tree} entry={tree.root} depth={0} path={EMPTY_PATH} parentId={null} onOpenEntry={onOpenEntry} />
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
  entry,
  depth,
  path,
  parentId,
  onOpenEntry,
}: {
  tree: GraphTree;
  entry: Entry;
  depth: number;
  /** Ancestor ids of this occurrence — the visited-path guard. */
  path: number[];
  parentId: number | null;
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

  return (
    <div>
      {/* One flat flex strip per row. A later slice adds a drag handle at the
          front and a ⋯ menu button at the end — both land as siblings in this
          strip, no restructuring. */}
      <div className={styles.row} style={{ paddingLeft: depth * 16 }}>
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

        {/* Muted text, not a control: it reports where else this one lives. */}
        {also && <span className={styles.also}>{also}</span>}
      </div>

      {expanded && hasChildren && (
        <div>
          {kids.map((child, index) => (
            <TreeNode
              key={`${child.id}-${index}`}
              tree={tree}
              entry={child}
              depth={depth + 1}
              path={[...path, entry.id]}
              parentId={entry.id}
              onOpenEntry={onOpenEntry}
            />
          ))}
        </div>
      )}
    </div>
  );
}
