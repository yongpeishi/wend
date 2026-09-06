import { useState } from 'react';
import { Button } from '../../design/components/core/Button';
import { joinMeta } from '../../lib/formatDates';
// The itinerary's own short duration form ("30 min", "1 hr 30"), not
// lib/formatDates' longer one — one screen, one convention.
import { formatDuration } from './itineraryModel';
import type { PoolEntry } from './itineraryModel';
import styles from './AddPicker.module.css';

export interface AddPickerProps {
  /** Everything kept for this trip, placed or not — the rail's pool. */
  choices: PoolEntry[];
  /** ISO date of the day this picker sits on, so a row can say "already on this day". */
  day: string;
  onPick: (entryId: number) => void;
  /**
   * Keep a brand-new idea and put it straight on this day. Optional: without
   * it the picker is the shelf it has always been, which is what a caller with
   * nowhere to create wants.
   */
  onCreate?: (title: string) => void;
  onClose: () => void;
  /** Set when the picker was opened from a gap: `14:15–18:30`. */
  slotLabel?: string;
}

/**
 * The pointer-free way onto a day: pick from what is kept for this trip.
 * Nothing is consumed by choosing — the same bundle may sit in two days at
 * once — so this list is a shelf, not a queue, and picking does not remove the
 * row from it. A row already on some day says so quietly; one already on THIS
 * day says that instead, and stays clickable — a deliberate second helping on
 * the same day is allowed, and the API permits it.
 *
 * It also KEEPS. Everything on the shelf had to be written down on the Ideas
 * board first, which is the wrong shape for how a day actually gets built:
 * planning Tuesday afternoon is exactly when "and the fish market" occurs to
 * you, and sending that thought to another screen to be written down — then
 * back here to be placed — is a round trip that loses it. The name box does
 * both halves at once, and what it creates is an ordinary trip idea: it sits
 * on the board afterwards like any other, and the detail panel is still where
 * the rest of it gets filled in.
 *
 * The box is FIRST, above the shelf. It answers the case the shelf cannot, and
 * a reader who scans the list, finds nothing they want and stops scanning
 * never reaches a control below it. Being first also costs the person who came
 * here to pick exactly one line to read past.
 */
export function AddPicker({ choices, day, onPick, onCreate, onClose, slotLabel }: AddPickerProps) {
  const [title, setTitle] = useState('');

  function create() {
    const kept = title.trim();
    if (!kept || !onCreate) return;
    // Cleared here rather than on the way back: the picker closes on submit,
    // but the same component instance is what reopens, and a name already
    // placed should not be sitting in the box waiting to be placed again.
    setTitle('');
    onCreate(kept);
  }

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
        <p className={styles.title}>Kept for this trip</p>
        {slotLabel && <p className={styles.slot}>{slotLabel}</p>}
        <Button size="small" variant="quiet" className={styles.close} onClick={onClose}>
          Not now
        </Button>
      </div>

      {onCreate && (
        /* Not a <form>. This picker opens inside a day card that already sits
           inside the screen's own markup, and a nested form is invalid HTML
           whose Enter submits the wrong thing. One field needs one key, so
           Enter is wired to the input directly.

           A name and nothing else is asked for. Everything else an idea can
           hold is on the board and in the detail panel — a category row here
           would turn "and the fish market" back into the form this box exists
           to skip. */
        <div className={styles.create}>
          <input
            type="text"
            className={styles.createInput}
            value={title}
            placeholder="Or keep something new — name it"
            aria-label="Name a new idea"
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              // isComposing: mid-IME, Enter picks the candidate. Swallowing it
              // would place a half-typed name on the day.
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              create();
            }}
          />
          <Button size="small" onClick={create} disabled={title.trim() === ''}>
            Add to day
          </Button>
        </div>
      )}

      {choices.length === 0 ? (
        /* Two endings to the same sentence, because the box above changes what
           the honest advice is. Told to keep something new, someone with the
           box in front of them would rightly wonder why they are being sent
           somewhere to do it. */
        <p className={styles.empty}>
          {onCreate
            ? 'Nothing kept for this trip yet. Name a new one above and it goes straight on.'
            : 'Nothing kept for this trip yet. Keep something on the Ideas board and it lands here.'}
        </p>
      ) : (
        choices.map((choice) => {
          // This day wins over the general marker: "placed · Day 2" on Day 2's
          // own picker would send the reader looking for a second Day 2.
          const marker = choice.placedOn.includes(day) ? 'already on this day' : choice.placedMarker;
          return (
            <button key={choice.id} type="button" className={styles.choice} onClick={() => onPick(choice.id)}>
              <span className={styles.choiceTitle}>{choice.title}</span>
              <span className={styles.choiceMeta}>
                {joinMeta(
                  choice.kind === 'bundle' ? 'Plan' : null,
                  formatDuration(choice.duration_minutes),
                )}
              </span>
              {marker && <span className={styles.choicePlaced}>{marker}</span>}
            </button>
          );
        })
      )}
    </div>
  );
}
