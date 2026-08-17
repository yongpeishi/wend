import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { Input } from '../../design/components/core/Input';
import { formatDay } from '../../lib/formatDates';
import styles from './DeadlineField.module.css';

export interface DeadlineFieldProps {
  /** ISO day `YYYY-MM-DD`, or null when no deadline is set. */
  value: string | null;
  /** New ISO day, or null when the deadline is cleared. Required unless readOnly. */
  onChange?: (next: string | null) => void;
  /** Render as text, never as a control. Returns null when there is no value. */
  readOnly?: boolean;
  /** Accessible name, e.g. "Deadline for Buy JR pass". Never rendered visibly. */
  label: string;
  /** Placed on the outermost element so the caller can position it. */
  className?: string;
}

function classes(...names: (string | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/**
 * A deadline on a checklist row: `by 3 Oct` when there is one, `+ Deadline`
 * when there is not, and a native date picker while you are changing it.
 *
 * Collapsed until opened, for the reason NewTripModal.tsx already writes down
 * for the trip's own dates: a native `type="date"` input paints `mm/dd/yyyy`
 * and a calendar glyph even while genuinely empty, so a row of them reads as a
 * row of half-filled fields. Most todos never get a deadline and are not worse
 * for it, so the resting state is a word, not a field — the control only exists
 * for as long as it is being used.
 *
 * Closed, it is styled as metadata rather than as a button (the quiet-label
 * idiom from TripChecklist's .doneToggle): on a list of twenty rows, twenty
 * bordered date fields would be the loudest thing on the page and the least
 * important.
 *
 * Purely presentational. It holds one piece of state — whether the picker is
 * open — and reports days upward; the caller owns `value` and whatever saving
 * it implies, so nothing here knows about todos, trips or the network.
 *
 * Closing rules follow from the native control doing the work. A `change` event
 * from a date input means the day is settled (the browser fires it when the
 * picker commits, not per keystroke), so committing and closing on it is the
 * whole interaction — there is no separate Save. Blur closes without committing
 * because by then any real pick has already fired its change; Escape closes
 * without committing because that is what Escape means everywhere else.
 */
export function DeadlineField({
  value,
  onChange,
  readOnly = false,
  label,
  className,
}: DeadlineFieldProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Escape is a keyboard cancel, so the keyboard has to end up somewhere
  // sensible — back on the control that opened. Blur and a committed pick both
  // leave focus wherever the user put it, which is why only Escape sets this.
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    onChange?.(next === '' ? null : next);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Escape') return;
    // Escape here cancels this picker and nothing further out — an ancestor
    // that also closes on Escape should not close too.
    event.stopPropagation();
    restoreFocus.current = true;
    setOpen(false);
  }

  if (readOnly) {
    if (value === null) return null;
    return (
      <span className={classes(styles.readOnly, className)}>{`by ${formatDay(value)}`}</span>
    );
  }

  if (open) {
    return (
      <Input
        ref={inputRef}
        type="date"
        aria-label={label}
        value={value ?? ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        wrapperClassName={classes(styles.inputWrapper, className)}
      />
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={classes(styles.trigger, className)}
      aria-label={label}
      onClick={() => setOpen(true)}
    >
      {value === null ? '+ Deadline' : `by ${formatDay(value)}`}
    </button>
  );
}
