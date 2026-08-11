import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Entry } from '../../api/types';
import { groupEntries } from './filters';
import type { GroupMode } from './filters';
import { IdeaRow } from './IdeaRow';
import styles from './IdeaList.module.css';

export interface IdeaListProps {
  /** Already filtered — this component groups and renders, it never narrows. */
  entries: Entry[];
  groupMode: GroupMode;
  bundles: Entry[];
  members: Map<number, Entry[]>;
  selectedIds: number[];
  onToggleSelect: (id: number, shiftKey: boolean) => void;
  onToast?: (message: string) => void;
}

/**
 * The board's idea list: flat in 'none', sectioned under collapsible headers in
 * 'category' and 'location'.
 *
 * Grouping is presentation only. `entries` arrives already filtered, and every
 * mode renders exactly the entries it was handed — so the category chips keep
 * narrowing the list while it is grouped by place, which is the whole point of
 * keeping the two controls apart.
 *
 * Collapsing is local state, not a filter: a collapsed section still counts its
 * ideas in its own header, so nothing ever silently disappears. It resets on
 * remount, which is the honest default — a fold is a glance, not a setting.
 *
 * On group order and the "No location" bucket, see `groupByLocation`.
 */
export function IdeaList({
  entries,
  groupMode,
  bundles,
  members,
  selectedIds,
  onToggleSelect,
  onToast,
}: IdeaListProps) {
  const idBase = useId();
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(() => new Set());

  const groups = groupEntries(entries, groupMode);

  function toggleGroup(key: string) {
    setCollapsedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function rows(list: Entry[]) {
    return list.map((entry) => (
      <IdeaRow
        key={entry.id}
        entry={entry}
        bundles={bundles}
        members={members}
        selected={selectedIds.includes(entry.id)}
        onToggleSelect={onToggleSelect}
        onToast={onToast}
      />
    ));
  }

  // Ungrouped: no headings to draw, just the rows.
  if (groupMode === 'none') {
    return <div className={styles.rows}>{rows(entries)}</div>;
  }

  return (
    <div className={styles.groups}>
      {groups.map((group) => {
        const panelId = `${idBase}-${group.key}`;
        const open = !collapsedKeys.has(group.key);
        return (
          <section key={group.key} className={styles.group}>
            <h3 className={styles.groupHeading}>
              <button
                type="button"
                className={styles.groupToggle}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggleGroup(group.key)}
              >
                <span className={styles.groupName}>{group.label}</span>
                <span className={styles.groupCount}>
                  {group.entries.length} {group.entries.length === 1 ? 'idea' : 'ideas'}
                  {' · '}
                  <ChevronDown
                    size={18}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className={[styles.chevron, open ? '' : styles.chevronCollapsed].filter(Boolean).join(' ')}
                  />
                </span>
              </button>
            </h3>
            <div id={panelId} className={styles.groupBody} hidden={!open}>
              {rows(group.entries)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
