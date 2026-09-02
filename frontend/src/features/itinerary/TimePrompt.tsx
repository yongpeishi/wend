import { useState } from 'react';
import { Button } from '../../design/components/core/Button';
import { Chip } from '../../design/components/core/Chip';
import { Field } from '../../components/Field';
import { CloseButton } from '../../components/CloseButton';
import { formatMinutes } from '../../api/schedule';
import type { SlotSuggestion } from './itineraryModel';
import { formatSpan } from './itineraryModel';
import styles from './TimePrompt.module.css';

export interface TimePromptProps {
  /** The placed thing's name, for the labels — two open prompts read apart. */
  title: string;
  /** e.g. "Wed 15". */
  dayName: string;
  /** The day's openings, best first. May be empty on a day with no timed items. */
  suggestions: SlotSuggestion[];
  /** Both minutes-from-midnight. A pair of nulls is "on the day, no hours". */
  onSave: (startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  onDismiss: () => void;
}

/**
 * Asked on arrival: a newly placed item lands untimed, and this panel opens
 * under the landed row to offer the day's openings as one-click chips, with
 * the same typed Starts/Ends pair TimeEditor keeps for anything the chips do
 * not name. Dismissing it is a real answer — the item stays on the day, loose.
 */

/*
 * parseTime, normalise and findProblem are TimeEditor's, copied verbatim
 * rather than imported: those helpers are that editor's private business, and
 * exporting them would turn its internals into a contract. The two must stay
 * identical — a time this prompt reads differently from the editor that later
 * reopens it would be a lie — and the full reasoning for each rule lives on
 * TimeEditor's own copies.
 */

/**
 * `9:00`, `09:00` and `0900` all parse, and so does a bare hour: `12` is
 * 12:00. Anything else is refused rather than guessed at — see TimeEditor.
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
 * What the field shows once it is left: a typed `12` settles to `12:00`.
 * Text the prompt is refusing is left exactly as it was typed.
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
 * Everything this prompt refuses, in one place. Order matters — an unreadable
 * field is named before anything is concluded from the pair.
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

/**
 * Which chip is lit: an index into the openings, 'none' for the trailing
 * "no time yet" chip, or null once typing has taken the fields somewhere no
 * chip names. The chips and the fields are one control seen two ways — a chip
 * fills the fields, and editing the fields puts the lie to whatever chip was
 * pressed, so the selection goes out rather than mislabel what will be saved.
 */
type Selected = number | 'none' | null;

export function TimePrompt({ title, dayName, suggestions, onSave, onDismiss }: TimePromptProps) {
  const first = suggestions.length > 0 ? suggestions[0] : null;
  // The best opening is already pressed and already in the fields, so the
  // common answer is one Enter away. A day with no openings starts on
  // "no time yet" instead — empty fields are what that chip means.
  const [start, setStart] = useState(first ? formatMinutes(first.start) : '');
  const [end, setEnd] = useState(first ? formatMinutes(first.end) : '');
  const [selected, setSelected] = useState<Selected>(first ? 0 : 'none');
  const [tried, setTried] = useState(false);

  // Same refusal choreography as TimeEditor: errors wait for a refused save,
  // except the backwards pair, which is already wrong and says so live.
  const problem = findProblem(start, end);
  const showing = problem && (tried || problem.live) ? problem : null;

  function pick(index: number) {
    const slot = suggestions[index];
    setStart(formatMinutes(slot.start));
    setEnd(formatMinutes(slot.end));
    setSelected(index);
    setTried(false);
  }

  function pickNone() {
    setStart('');
    setEnd('');
    setSelected('none');
    setTried(false);
  }

  function save() {
    if (problem) {
      setTried(true);
      return;
    }
    onSave(parseTime(start), parseTime(end));
  }

  return (
    <div
      className={styles.prompt}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onDismiss();
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          save();
        }
      }}
    >
      {/* The X is Escape made visible — the same dismissal "Leave it loose"
          offers, and nothing more. Every panel carries one in the same corner,
          so a pointer finds the way out here without reading the buttons. */}
      <CloseButton onClick={onDismiss} />
      <p className={styles.caption}>On the day. When on {dayName}?</p>

      <div className={styles.chips}>
        {suggestions.map((slot, index) => (
          <Chip key={`${slot.start}-${slot.end}`} selected={selected === index} onClick={() => pick(index)}>
            <span className={styles.chipTime}>{formatSpan(slot.start, slot.end)}</span>
            {slot.label}
          </Chip>
        ))}
        {/* Always offered, even among good openings: loose is a real answer,
            and the chip row should say so in the same voice as the rest. */}
        <Chip selected={selected === 'none'} onClick={pickNone}>
          no time yet
        </Chip>
      </div>

      <div className={styles.fields}>
        <Field
          label={`Starts for ${title}`}
          className={styles.timeInput}
          value={start}
          placeholder="09:00"
          inputMode="numeric"
          autoFocus
          error={showing?.field === 'start' ? showing.message : undefined}
          onChange={(event) => {
            setStart(event.target.value);
            setSelected(null);
            setTried(false);
          }}
          // Leaving the box settles it to HH:MM. Only the text changes —
          // `tried` is deliberately left alone, so a message already asked for
          // by the button does not vanish just because focus moved.
          onBlur={(event) => setStart(normalise(event.target.value))}
        />
        <Field
          label={`Ends for ${title}`}
          className={styles.timeInput}
          value={end}
          placeholder="10:30"
          inputMode="numeric"
          error={showing?.field === 'end' ? showing.message : undefined}
          onChange={(event) => {
            setEnd(event.target.value);
            setSelected(null);
            setTried(false);
          }}
          onBlur={(event) => setEnd(normalise(event.target.value))}
        />
      </div>

      <div className={styles.actions}>
        <Button size="small" variant="quiet" onClick={onDismiss}>
          Leave it loose
        </Button>
        {/* Dead only for a problem shown before it is pressed, the way
            TimeEditor holds "Set the hours" shut on a backwards pair. The
            others are still worth pressing: pressing is what says why. */}
        <Button size="small" disabled={Boolean(showing?.live)} onClick={save}>
          Set the hours
        </Button>
      </div>
    </div>
  );
}
