import { Button } from '../../design/components/core/Button';
import { Modal } from '../../components/Modal';
import { formatDay } from '../../lib/formatDates';
import styles from './DateShiftWarningModal.module.css';

export interface DateShiftWarningModalProps {
  open: boolean;
  /** ISO `YYYY-MM-DD`, ascending — the dates that fall outside the new range. */
  droppedDays: string[];
  /** How many placed things sit on them. Zero is normal: a day can be empty. */
  droppedItemCount: number;
  /** Changes nothing. The gate stays open on the dates that were typed. */
  onCancel: () => void;
  /** Re-sends the same dates, this time with `confirm_dropped_days`. */
  onConfirm: () => void;
  saving?: boolean;
}

/**
 * `23 Aug`, `23 Aug and 25 Aug`, `23 Aug, 25 Aug and 27 Aug`. The itinerary's
 * own day format (lib/formatDates.formatDay), and no comma before the "and" —
 * the last pair is joined by the word alone.
 */
function listDays(days: string[]): string {
  const written = days.map(formatDay);
  if (written.length <= 1) return written[0] ?? '';
  return `${written.slice(0, -1).join(', ')} and ${written[written.length - 1]}`;
}

/**
 * Everything the dialog says, as plain strings.
 *
 * Singular and plural are written out rather than pluralised with an "(s)":
 * one day losing its plan is a different sentence from three, and both halves
 * have to agree — the days ("it"/"them") and the ideas on them, which do not
 * count together.
 *
 * Kept unexported deliberately: this file exports one component, and a second
 * export from it costs a Fast Refresh warning for something the modal's own
 * test already reads through the rendered dialog.
 */
function dateShiftWarningCopy(droppedDays: string[], droppedItemCount: number) {
  const days = droppedDays.length;
  const oneDay = days === 1;
  const oneItem = droppedItemCount === 1;
  const it = oneDay ? 'it' : 'them';

  const lines = [`${listDays(droppedDays)} ${oneDay ? 'falls' : 'fall'} outside the new dates, so what you've placed on ${it} comes off.`];

  if (droppedItemCount === 0) {
    lines.push(`Nothing is placed on ${it}, so nothing is lost.`);
  } else {
    lines.push(
      `The ${oneItem ? 'idea' : `${droppedItemCount} ideas`} on ${it} ${oneItem ? 'goes' : 'go'} back to "Not placed yet", so nothing is lost — you can place ${oneItem ? 'it' : 'them'} on another day.`,
      `If you'd rather keep ${oneDay ? 'that plan' : 'those plans'}, move the ideas onto ${oneDay ? 'a day' : 'days'} inside the new dates first, then change the dates.`,
    );
  }

  return {
    title: `Change the dates and clear ${oneDay ? '1 day' : `${days} days`}?`,
    lines,
    confirmLabel: oneDay ? 'Yes, clear that day' : 'Yes, clear those days',
  };
}

/**
 * The one thing changing a trip's dates can cost you.
 *
 * Moving the dates moves the whole plan by the same delta, so Day 2 stays
 * Day 2 — nothing to warn about there. What needs saying is the other case: a
 * shorter trip has nowhere to put its last days, so those days come off. The
 * server refuses that write outright and answers with the dates it would have
 * to clear, which means this dialog stands in front of a change that has not
 * happened. Cancelling therefore has nothing to undo.
 *
 * The copy says the true things and stops: which days, that what is on them
 * goes back to "Not placed yet" rather than being deleted, that moving them
 * out first is how to keep those plans, and — in the title — that the dates
 * change too.
 */
export function DateShiftWarningModal({
  open,
  droppedDays,
  droppedItemCount,
  onCancel,
  onConfirm,
  saving = false,
}: DateShiftWarningModalProps) {
  const { title, lines, confirmLabel } = dateShiftWarningCopy(droppedDays, droppedItemCount);

  return (
    <Modal
      // Nothing to confirm with no days to lose: the write would have gone
      // through on its own.
      open={open && droppedDays.length > 0}
      onClose={onCancel}
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            No, don't change the dates
          </Button>
          <Button onClick={onConfirm} disabled={saving} aria-busy={saving || undefined}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {lines.map((line) => (
        <p key={line} className={styles.line}>
          {line}
        </p>
      ))}
    </Modal>
  );
}
