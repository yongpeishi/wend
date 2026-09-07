import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Row } from '../../components/layout/Stack';
import { Button } from '../../design/components/core/Button';
import { canDeleteForGood } from '../../auth/tripRole';
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
  /**
   * Start the delete-for-good gesture on one set-aside thing. Absent means no
   * delete verb, and the section behaves exactly as it does today — the note in
   * the empty state changes with it, so the section never promises a verb it
   * was not handed.
   */
  onDeleteForGood?: (entry: Entry) => void;
}

/**
 * Setting aside is the reversible step, and this is where the things that took
 * it live. Every scope gets the same affordance: a "Set aside · N" disclosure
 * that reveals what was archived, each with a one-tap "Pick it back up" — never
 * struck through, never greyed to mean rejected.
 *
 * Nothing on the board deletes. This list is the one place in the product where
 * a second, final step exists: once something is set aside, and only then, it
 * can be deleted for good from here. The verb is deliberately one level in — you
 * reach it by having already put the thing down, which is what makes the
 * confirmation dialog behind it the second of two decisions rather than the
 * first.
 *
 * A viewer keeps the disclosure and everything inside it. What was set aside is
 * part of the trip's story — knowing the ramen place was considered and dropped
 * is exactly the sort of thing you are reading along for — so the only things
 * that go are the buttons that would put it back or end it.
 *
 * The disclosure renders even with nothing in it. It used to return null, which
 * meant the one mechanism for getting rid of something was invisible to exactly
 * the person who had never used it: someone hunting for a delete found an empty
 * board with no hint that setting aside was the road to it. Empty, it is a
 * collapsed toggle over a sentence saying what this place is for.
 */
export function SetAsideSection({
  entries,
  onRestore,
  canEdit = true,
  onDeleteForGood,
}: SetAsideSectionProps) {
  const [open, setOpen] = useState(false);
  const empty = entries.length === 0;

  return (
    <div className={styles.wrap}>
      {/* "Set aside · 0" reads as a broken counter rather than as a count. The
          dot and the number name a quantity, and with nothing here there is no
          quantity to name — so the label falls back to the bare name of the
          place. */}
      <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" /> : <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" />}
        {empty ? 'Set aside' : `Set aside · ${entries.length}`}
      </button>
      {open && (
        <div className={styles.list}>
          {empty ? (
            // Only promise the verb this section was actually handed. On a
            // surface without `onDeleteForGood` the sentence stops at where
            // things land, because there is nothing here that could delete one.
            <p className={styles.note}>
              {onDeleteForGood
                ? 'Nothing set aside. Things you set aside land here, and you can delete them for good from here.'
                : 'Nothing set aside. Things you set aside land here.'}
            </p>
          ) : (
            entries.map((entry) => (
              <Row key={entry.id} justify="between" gap={2}>
                <span className={styles.title}>{entry.title}</span>
                {canEdit && (
                  <Row gap={2}>
                    {/* Bordered, because picking it back up is the offer this
                        row is making — the same shape "Bring back" has on the
                        trips list and on the entry detail's set-aside note. It
                        used to be quiet, which left the two buttons here
                        identical to the pixel. */}
                    <Button variant="secondary" size="small" onClick={() => onRestore(entry.id)}>
                      Pick it back up
                    </Button>
                    {/* Quieter than the way back, on purpose, and the weaker of
                        the two on the row it shares. Delete for good is the
                        heavier act; a heavier-looking button next to "Pick it
                        back up" would make the irreversible one the obvious
                        thing to press. It was not actually quieter until now:
                        both were quiet/small-vs-medium, which is the same ink,
                        the same weight and the same size rendered — a size
                        class that changes nothing you can see is not a
                        difference. It is plain muted text now, the way the
                        trips list has always drawn this verb. The rust fill
                        this product reserves for destroying something is spent
                        once, on the confirm inside the dialog. */}
                    {onDeleteForGood && canDeleteForGood(entry) && (
                      <Button
                        variant="quiet"
                        size="small"
                        className={styles.deleteForGood}
                        onClick={() => onDeleteForGood(entry)}
                      >
                        Delete for good
                      </Button>
                    )}
                  </Row>
                )}
              </Row>
            ))
          )}
        </div>
      )}
    </div>
  );
}
