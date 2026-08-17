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
  /** Accessible name, e.g. "By when for Buy JR pass". Never rendered visibly. */
  label: string;
  /** Placed on the outermost element so the caller can position it. */
  className?: string;
}

function classes(...names: (string | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/**
 * A deadline on a checklist row: `by 3 Oct` when there is one, `+ By when?`
 * when there is not, and a native date picker while you are changing it.
 *
 * The empty state asks rather than labels, and it asks softly. "Deadline" is a
 * word about consequences — it belongs to work you will be held to, and this is
 * a list of things somebody wants to have done before a holiday. "By when?" is
 * the same question with none of the threat in it, and it reads as a question
 * because that is what an empty control is. The component, its file and its
 * class names still say deadline: `due_on` is what the API calls the field and
 * a deadline is what it holds, so renaming the module would buy a reader
 * nothing and cost them the thread back to the endpoint.
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
 * Purely presentational. It holds the day being typed and whether the picker is
 * open, and reports finished days upward; the caller owns `value` and whatever
 * saving it implies, so nothing here knows about todos, trips or the network.
 *
 * Closing rules follow from what a native date input actually does, which is
 * not what it looks like it does. It fires `change` the moment all three
 * segments hold something parseable — and a year of `2` parses, so typing
 * `20/09/2026` fires a change at `0002-09-20` on the way past. Committing on
 * `change` therefore saves year 2 for every date entered from the keyboard, and
 * on a field that already holds a day the very first keystroke re-completes it,
 * so one key press saves and closes before the month can be reached.
 *
 * So `change` is treated as typing, not as an answer: it updates a local draft
 * and nothing else. The commit happens when the interaction ends — blur or
 * Enter — because both mean the user has stopped editing. That also covers the
 * mouse: picking a day in the browser's calendar popup fires `change` and
 * leaves focus in the input without firing blur, so the pick lives in the draft
 * until focus finally leaves, and saves then. Escape closes without committing,
 * because that is what Escape means everywhere else.
 */
export function DeadlineField({
  value,
  onChange,
  readOnly = false,
  label,
  className,
}: DeadlineFieldProps) {
  const [open, setOpen] = useState(false);
  // The day as it is being typed. Only ever becomes a `value` on the way out.
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // A keyboard exit — Enter or Escape — has to leave the keyboard somewhere
  // sensible, and the control that opened is where it came from. A blur has
  // already moved focus by definition, so it is the one exit that never sets
  // this: the user's own click or tab decides where they end up.
  const restoreFocus = useRef(false);
  // Closing the field takes the focused input off the page, and some browsers
  // fire blur when that happens. A cancel has to survive that: the blur it
  // provokes must not turn round and save the draft it just threw away.
  const cancelled = useRef(false);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  function handleOpen() {
    setDraft(value ?? '');
    cancelled.current = false;
    setOpen(true);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setDraft(event.target.value);
  }

  function commit() {
    setOpen(false);
    if (cancelled.current) return;
    // An empty field is an answer: it is how a deadline is taken off a row.
    const next = draft === '' ? null : draft;
    // A year under four digits is a date halfway through being typed, not one
    // anybody means — nobody is planning for the year 2. Drop it rather than
    // save it, so the row keeps the deadline it had.
    if (next !== null && Number(next.slice(0, 4)) < 1000) return;
    // The field is opened far more often than it is changed; a reopen and a
    // tab away should not spend a network write on the day already stored.
    if (next === value) return;
    onChange?.(next);
  }

  function cancel() {
    cancelled.current = true;
    restoreFocus.current = true;
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      // Enter ends the edit here; it is not an ancestor form's submit.
      event.preventDefault();
      restoreFocus.current = true;
      commit();
      return;
    }
    if (event.key !== 'Escape') return;
    // Escape here cancels this picker and nothing further out — an ancestor
    // that also closes on Escape should not close too.
    event.stopPropagation();
    cancel();
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
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={commit}
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
      onClick={handleOpen}
    >
      {value === null ? '+ By when?' : `by ${formatDay(value)}`}
    </button>
  );
}
