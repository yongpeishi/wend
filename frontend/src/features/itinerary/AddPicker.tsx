import { Button } from '../../design/components/core/Button';
import type { EntrySummary } from '../../api/types';
import { joinMeta } from '../../lib/formatDates';
// The itinerary's own short duration form ("30 min", "1 hr 30"), not
// lib/formatDates' longer one — one screen, one convention.
import { formatDuration } from './itineraryModel';
import styles from './AddPicker.module.css';

export interface AddPickerProps {
  /** Kept ideas and bundles that sit in no live version yet. */
  choices: EntrySummary[];
  onPick: (entryId: number) => void;
  onClose: () => void;
  /** Set when the picker was opened from a gap: `14:15–18:30`. */
  slotLabel?: string;
}

/**
 * The pointer-free way onto a day: pick from what is kept and not placed yet.
 * Nothing is consumed by choosing — the same bundle may sit in two days at
 * once — so this list is a shelf, not a queue, and picking does not remove the
 * row from it here; the day's data is what decides that.
 */
export function AddPicker({ choices, onPick, onClose, slotLabel }: AddPickerProps) {
  return (
    <div
      className={styles.picker}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onClose();
      }}
    >
      <div className={styles.head}>
        <p className={styles.title}>Kept and not placed yet</p>
        {slotLabel && <p className={styles.slot}>{slotLabel}</p>}
        <Button size="small" variant="quiet" className={styles.close} onClick={onClose}>
          Not now
        </Button>
      </div>

      {choices.length === 0 ? (
        <p className={styles.empty}>Everything you've kept is already on a day. Keep something new and it lands here.</p>
      ) : (
        choices.map((choice) => (
          <button key={choice.id} type="button" className={styles.choice} onClick={() => onPick(choice.id)}>
            <span className={styles.choiceTitle}>{choice.title}</span>
            <span className={styles.choiceMeta}>
              {joinMeta(
                choice.kind === 'bundle' ? 'Plan' : null,
                choice.location_name,
                formatDuration(choice.duration_minutes),
              )}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
