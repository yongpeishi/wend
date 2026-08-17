import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '../../design/components/core/Button';
import type { DayVersion } from '../../api/types';
import { daySummary, versionSpan } from './itineraryModel';
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
  /**
   * A viewer's panel: the count, the disclosure and every summary inside it all
   * stay — what a trip set aside is part of reading the trip — and only the way
   * back is gone, because bringing a version back is a change to the day.
   */
  readOnly?: boolean;
}

/**
 * Kept, but not the one you chose. Archiving is what "keep this day" does to
 * the versions you did not settle on — nothing in Wend is deleted, so the way
 * back has to be on screen somewhere for anyone who can take it (`readOnly`).
 * It is rarely reached, which is why it sits collapsed behind a count rather
 * than taking rail space from the ideas still waiting to be placed.
 *
 * An archived version is summarised, not replayed. The rail is 300px wide and
 * the day's own row language needs more than that — a 104px mono time column,
 * a title and right-aligned metadata on one line — so drawing the version's
 * running order here collides its own columns into unreadable text. Rarely
 * reached also means "answer one question": what was in it, and when did it
 * have you out. That is a span, a count and the titles in order, all in plain
 * wrapping text with no columns to collide.
 *
 * So there are no gap rows and no bundle bands either. A hole between two
 * things you already set aside is not a hole you can fill, and a bundle you
 * cannot edit is just one more title in the list. Bring it back and it becomes
 * a live version again, drawn in full on its own day.
 */
export function ArchivedPanel({ archived, open, onToggle, onRestore, readOnly = false }: ArchivedPanelProps) {
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
          {archived.map(({ version, label }) => {
            const titles = daySummary(version.schedule_items);
            return (
              <div key={version.id} className={styles.entry}>
                <p className={styles.label}>{label}</p>
                <p className={styles.held}>{held(version)}</p>
                {titles && <p className={styles.titles}>{titles}</p>}
                {!readOnly && (
                  <Button
                    size="small"
                    variant="quiet"
                    className={styles.restore}
                    onClick={() => onRestore(version.id)}
                    aria-label={`Bring back ${label}`}
                  >
                    Bring back
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** `09:00–13:00 · 3 things` — the span, then how much was in it. */
function held(version: DayVersion): string {
  const items = version.schedule_items;
  if (items.length === 0) return 'Nothing was on it.';

  const count = `${items.length} ${items.length === 1 ? 'thing' : 'things'}`;
  const span = versionSpan(items);
  return span ? `${span} · ${count}` : count;
}
