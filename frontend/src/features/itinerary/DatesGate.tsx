import { useState } from 'react';
import { Button } from '../../design/components/core/Button';
import { Chip } from '../../design/components/core/Chip';
import { Field } from '../../components/Field';
import { addDays } from '../schedule/scheduleModel';
import styles from './DatesGate.module.css';

export interface DatesGateProps {
  tripTitle: string;
  /** How many ideas and bundles are already kept for this trip. */
  keptCount: number;
  /** Both ISO `YYYY-MM-DD`. */
  onConfirm: (startsOn: string, endsOn: string) => void;
  onBack: () => void;
  saving?: boolean;
  /** Prefilled when the gate is reopened by "Change dates". */
  initialStart?: string | null;
  initialEnd?: string | null;
}

/** 3, 5 and 7 nights-of-sleep apart — the lengths people actually name. */
const LENGTHS: { label: string; days: number }[] = [
  { label: '3 days', days: 3 },
  { label: '5 days', days: 5 },
  { label: 'A week', days: 7 },
];

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function keptLine(keptCount: number, tripTitle: string): string {
  if (keptCount === 0) {
    return `Nothing is kept for ${tripTitle} yet. The days open anyway — you can keep things as you go.`;
  }
  const things = keptCount === 1 ? '1 thing' : `${keptCount} things`;
  return `You've kept ${things} for ${tripTitle}. They'll be waiting on the right when the days open.`;
}

/**
 * The screen before the screen. Days come from the trip's dates, so with no
 * dates there is no day list to draw — and rather than showing an empty one
 * and nagging, the whole screen becomes this single card.
 *
 * Rough is fine and the copy says so: dates move, and everything placed moves
 * with them. A length chip is the third way in, for the trip that has a
 * starting day and a shape but no return flight yet — it fills the first day
 * with today if you have not picked one, because a length has to count from
 * something.
 */
export function DatesGate({
  tripTitle,
  keptCount,
  onConfirm,
  onBack,
  saving = false,
  initialStart = null,
  initialEnd = null,
}: DatesGateProps) {
  const [start, setStart] = useState(initialStart ?? '');
  const [end, setEnd] = useState(initialEnd ?? '');

  const backwards = Boolean(start && end && end < start);
  const ready = Boolean(start && end) && !backwards;

  function setLength(days: number) {
    const from = start || todayIso();
    setStart(from);
    setEnd(addDays(from, days - 1));
  }

  return (
    <div className={styles.gate}>
      <div className={styles.card}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Before the days appear</p>
          <h1 className={styles.title}>When are you going?</h1>
          <p className={styles.body}>
            Days come from your dates. Rough is fine — you can move them later and everything you've placed
            shifts with them.
          </p>
        </div>

        <div className={styles.fields}>
          <Field
            label="First day"
            type="date"
            className={styles.dateInput}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
          <Field
            label="Last day"
            type="date"
            className={styles.dateInput}
            value={end}
            error={backwards ? 'The last day comes before the first.' : undefined}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>

        <div className={styles.lengths}>
          <span className={styles.lengthsLabel}>Or set a length:</span>
          {LENGTHS.map((length) => (
            <Chip key={length.days} onClick={() => setLength(length.days)}>
              {length.label}
            </Chip>
          ))}
        </div>

        <p className={styles.kept}>{keptLine(keptCount, tripTitle)}</p>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onBack}>
            Back to ideas
          </Button>
          <Button disabled={!ready || saving} aria-busy={saving || undefined} onClick={() => onConfirm(start, end)}>
            Open the days
          </Button>
        </div>
      </div>
    </div>
  );
}
