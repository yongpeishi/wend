import { useState } from 'react';
import { Button } from '../../design/components/core/Button';
import { Field } from '../../components/Field';
import { formatMinutes } from '../../api/schedule';
import styles from './TimeEditor.module.css';

export interface TimeEditorProps {
  startsAtMinutes: number | null;
  endsAtMinutes: number | null;
  /** Both minutes-from-midnight. A cleared end is null — "starts at, ends when it ends". */
  onSave: (startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  onCancel: () => void;
  /** Named in the labels so two open editors are told apart by a screen reader. */
  title?: string;
}

/**
 * `HH:MM`, typed. The prototype had no way to change an item's hours at all;
 * this is the whole time story for the itinerary (contract §6 rules out
 * drag-resize), so it stays small enough to sit inline in the row it edits.
 *
 * Plain text inputs rather than `<input type="time">`: the native control
 * renders as a 12-hour picker under an en-US locale, and 24-hour times are a
 * house rule, not a preference. Typing is also faster than a stepper for the
 * one thing this does.
 */

/** `9:00`, `09:00` and `0900` all parse. Anything else is refused rather than guessed at. */
function parseTime(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const match = /^(\d{1,2}):?(\d{2})$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function TimeEditor({ startsAtMinutes, endsAtMinutes, onSave, onCancel, title }: TimeEditorProps) {
  const [start, setStart] = useState(formatMinutes(startsAtMinutes));
  const [end, setEnd] = useState(formatMinutes(endsAtMinutes));
  const [error, setError] = useState<string | null>(null);

  const suffix = title ? ` for ${title}` : '';

  function save() {
    const startMinutes = parseTime(start);
    const endMinutes = parseTime(end);

    if (start.trim() && startMinutes === null) {
      setError('Times read like 09:40.');
      return;
    }
    if (end.trim() && endMinutes === null) {
      setError('Times read like 09:40.');
      return;
    }
    if (startMinutes === null && endMinutes !== null) {
      setError('An ending needs a start.');
      return;
    }
    if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
      setError('The end comes before the start.');
      return;
    }

    onSave(startMinutes, endMinutes);
  }

  return (
    <div
      className={styles.editor}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          save();
        }
      }}
    >
      <div className={styles.fields}>
        <Field
          label={`Starts${suffix}`}
          className={styles.timeInput}
          value={start}
          placeholder="09:00"
          inputMode="numeric"
          autoFocus
          onChange={(event) => {
            setStart(event.target.value);
            setError(null);
          }}
        />
        <Field
          label={`Ends${suffix}`}
          className={styles.timeInput}
          value={end}
          placeholder="10:30"
          inputMode="numeric"
          onChange={(event) => {
            setEnd(event.target.value);
            setError(null);
          }}
        />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button size="small" variant="secondary" onClick={onCancel}>
          Leave it
        </Button>
        <Button size="small" onClick={save}>
          Set the hours
        </Button>
      </div>
    </div>
  );
}
