import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../../design/components/core/Button';
import type { DayVersion } from '../../api/types';
import { VersionItems } from './VersionItems';
import styles from './ArchivedPanel.module.css';

export interface ArchivedVersion {
  version: DayVersion;
  /** `Day 4 · Wed 15 · Version B` — the panel is trip-wide, so it must say which day. */
  label: string;
}

export interface ArchivedPanelProps {
  archived: ArchivedVersion[];
  open: boolean;
  onToggle: () => void;
  onRestore: (versionId: number) => void;
}

/**
 * Kept, but not the one you chose. Archiving is what "keep this day" does to
 * the versions you did not settle on — nothing in Wend is deleted, so the way
 * back has to be on screen somewhere. It is rarely reached, which is why it
 * sits collapsed behind a count rather than taking rail space from the ideas
 * still waiting to be placed.
 *
 * An archived version is shown, never edited: its items render read-only, so
 * the panel answers "what was in it?" without pretending you can change a plan
 * you already set aside. Bring it back and it becomes a live version again.
 */
export function ArchivedPanel({ archived, open, onToggle, onRestore }: ArchivedPanelProps) {
  if (archived.length === 0) return null;

  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.toggle} onClick={onToggle} aria-expanded={open}>
        <span>Archived · {archived.length}</span>
        <Chevron size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.list}>
          {archived.map(({ version, label }) => (
            <div key={version.id} className={styles.entry}>
              <div className={styles.head}>
                <span className={styles.label}>{label}</span>
                <Button
                  size="small"
                  variant="quiet"
                  className={styles.restore}
                  onClick={() => onRestore(version.id)}
                  aria-label={`Bring back ${label}`}
                >
                  Bring back
                </Button>
              </div>
              <VersionItems items={version.schedule_items} readOnly />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
