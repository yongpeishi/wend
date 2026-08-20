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

/**
 * `9:00`, `09:00` and `0900` all parse, and so does a bare hour: `12` is 12:00,
 * `9` is 09:00, `0` is 00:00. That last one is a reading, not a guess — a time
 * has exactly one hour in it, so an hour typed alone leaves nothing ambiguous,
 * and "on the hour" is the only whole time it can name. Most hours on a day are
 * on the hour, and typing two characters for them is the point.
 *
 * The minute half of the pattern is what is optional; everything else is as it
 * was. Three digits keep their old reading through the same branch as before
 * (`900` backtracks to 9 and 00, so 09:00), and four keep theirs (`0900`).
 *
 * Anything else is refused rather than guessed at: `12:3` and `1:2` are half a
 * time, `ab` is not one at all, and `25`, `25:00` and `12:60` name an hour or a
 * minute that does not exist. A bare `25` is refused for the same reason
 * `25:00` is — reading the hour does not mean inventing a legal one.
 */
function parseTime(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const match = /^(\d{1,2})(?::?(\d{2}))?$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * What the field shows once it is left, so the reader sees what was understood
 * before anything is saved: a typed `12` settles to `12:00`. `formatMinutes` is
 * the same formatter the fields open on, so a normalised field and an untouched
 * one are written the same way.
 *
 * Text the editor is refusing is left exactly as it was typed. Rewriting it
 * would either hide the mistake or invent a correction for it, and the message
 * under the box is about the characters that are there.
 */
function normalise(text: string): string {
  const minutes = parseTime(text);
  return minutes === null ? text : formatMinutes(minutes);
}

interface Problem {
  /** Which field carries the message, so it lands under the box at fault. */
  field: 'start' | 'end';
  message: string;
  /**
   * Shown as you type rather than only once a save is refused. Only true for
   * a backwards pair: half a typed time is not yet wrong, but two whole times
   * in the wrong order already are.
   */
  live: boolean;
}

/**
 * Everything this editor refuses, in one place. Order matters — an unreadable
 * field is named before anything is concluded from the pair.
 *
 * Nothing else is a problem. Gaps, overlaps with the item above, an item that
 * runs to midnight and a zero-length one (start == end, the same rule the
 * server keeps) are all legal plans, not mistakes to be corrected.
 */
function findProblem(start: string, end: string): Problem | null {
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);

  if (start.trim() && startMinutes === null) {
    return { field: 'start', message: 'Times read like 09:40.', live: false };
  }
  if (end.trim() && endMinutes === null) {
    return { field: 'end', message: 'Times read like 09:40.', live: false };
  }
  if (startMinutes === null && endMinutes !== null) {
    return { field: 'end', message: 'An ending needs a start.', live: false };
  }
  if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
    return { field: 'end', message: 'The end comes before the start.', live: true };
  }
  return null;
}

export function TimeEditor({ startsAtMinutes, endsAtMinutes, onSave, onCancel, title }: TimeEditorProps) {
  const [start, setStart] = useState(formatMinutes(startsAtMinutes));
  const [end, setEnd] = useState(formatMinutes(endsAtMinutes));
  const [tried, setTried] = useState(false);

  const suffix = title ? ` for ${title}` : '';

  // The message hangs off the field it is about, through <Field error>, rather
  // than sitting loose under both: that is what puts the rust error border
  // (--border-error) on the box at fault and ties the text to the input with
  // aria-describedby. This is a refusal, not a saved thing — the one border on
  // this screen that is allowed to be red is the one saying a time cannot be
  // read or ends before it starts. DatesGate
  // says "The last day comes before the first." the same way.
  const problem = findProblem(start, end);
  const showing = problem && (tried || problem.live) ? problem : null;

  function save() {
    if (problem) {
      setTried(true);
      return;
    }
    onSave(parseTime(start), parseTime(end));
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
          error={showing?.field === 'start' ? showing.message : undefined}
          onChange={(event) => {
            setStart(event.target.value);
            setTried(false);
          }}
          // Leaving the box settles it to HH:MM. Only the text changes — `tried`
          // is deliberately left alone, so a message already asked for by the
          // button does not vanish just because focus moved to the other field.
          onBlur={(event) => setStart(normalise(event.target.value))}
        />
        <Field
          label={`Ends${suffix}`}
          className={styles.timeInput}
          value={end}
          placeholder="10:30"
          inputMode="numeric"
          error={showing?.field === 'end' ? showing.message : undefined}
          onChange={(event) => {
            setEnd(event.target.value);
            setTried(false);
          }}
          onBlur={(event) => setEnd(normalise(event.target.value))}
        />
      </div>
      <div className={styles.actions}>
        <Button size="small" variant="secondary" onClick={onCancel}>
          Leave it
        </Button>
        {/* Dead only for a problem shown before it is pressed, the way
            DatesGate holds "Open the days" shut on a backwards range. The
            others are still worth pressing: pressing is what says why. */}
        <Button size="small" disabled={Boolean(showing?.live)} onClick={save}>
          Set the hours
        </Button>
      </div>
    </div>
  );
}
