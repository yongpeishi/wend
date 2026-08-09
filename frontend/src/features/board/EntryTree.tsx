import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEntries } from '../../api';
import type { Entry } from '../../api/types';
import styles from './EntryTree.module.css';

export interface EntryTreeProps {
  trip: Entry;
  selectedId: number;
  onSelect: (id: number, title: string) => void;
}

/**
 * The entry hierarchy — `Japan > Kyoto > Nanzen-ji`. The trip root is always
 * the first row, always selectable: that is the "way back to the wider view"
 * principle 1 asks for. Bundles are left out of this tree on purpose — they
 * are a grouping mechanic (right column), not a place/theme layer, so mixing
 * them in here would duplicate the bundles column under a different name.
 */
export function EntryTree({ trip, selectedId, onSelect }: EntryTreeProps) {
  return (
    <nav aria-label="Trip structure" className={styles.tree}>
      <TreeNode entry={trip} depth={0} isRoot selectedId={selectedId} onSelect={onSelect} />
    </nav>
  );
}

function TreeNode({
  entry,
  depth,
  isRoot = false,
  selectedId,
  onSelect,
}: {
  entry: Entry;
  depth: number;
  isRoot?: boolean;
  selectedId: number;
  onSelect: (id: number, title: string) => void;
}) {
  const [expanded, setExpanded] = useState(isRoot);
  const hasChildren = entry.children_count > 0;
  const { data: children } = useEntries({ parent_id: entry.id }, { enabled: expanded && hasChildren });
  const kids = (children ?? []).filter((child) => child.kind !== 'bundle');

  return (
    <div>
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
        <button
          type="button"
          className={styles.node}
          aria-current={selectedId === entry.id ? 'true' : undefined}
          onClick={() => onSelect(entry.id, entry.title)}
        >
          {entry.title}
        </button>
      </div>
      {expanded && kids.length > 0 && (
        <div>
          {kids.map((child) => (
            <TreeNode key={child.id} entry={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
