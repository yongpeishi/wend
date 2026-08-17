import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Row } from '../../components/layout/Stack';
import { Button } from '../../design/components/core/Button';
import type { Entry } from '../../api/types';
import styles from './SetAsideSection.module.css';

export interface SetAsideSectionProps {
  entries: Entry[];
  onRestore: (id: number) => void;
  /**
   * May you change this trip? A prop rather than `useCanEdit()` because this
   * section already takes its one verb as a callback — the capability arrives
   * beside the action it governs. Defaults to true, matching a null role.
   */
  canEdit?: boolean;
}

/**
 * Nothing is deleted, only set aside. Every scope gets this same affordance:
 * a "Set aside · N" disclosure that reveals what was archived, each with a
 * one-tap "Pick it back up" — never struck through, never greyed to mean
 * rejected.
 *
 * A viewer keeps the disclosure and everything inside it. What was set aside is
 * part of the trip's story — knowing the ramen place was considered and dropped
 * is exactly the sort of thing you are reading along for — so the only thing
 * that goes is the button that would put it back.
 */
export function SetAsideSection({ entries, onRestore, canEdit = true }: SetAsideSectionProps) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" /> : <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />}
        Set aside · {entries.length}
      </button>
      {open && (
        <div className={styles.list}>
          {entries.map((entry) => (
            <Row key={entry.id} justify="between" gap={2}>
              <span className={styles.title}>{entry.title}</span>
              {canEdit && (
                <Button variant="quiet" onClick={() => onRestore(entry.id)}>
                  Pick it back up
                </Button>
              )}
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}
