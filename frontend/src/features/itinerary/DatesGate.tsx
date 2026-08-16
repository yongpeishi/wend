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
 * The question is an `<h2>` at display size: the trip's title in the shell
 * above is the page's one `<h1>`, but this card is the whole screen while the
 * gate is up, so the level is semantics and the size is the truth about what
 * you are looking at. The eyebrow over it stays a paragraph.
 *
 * Rough is fine and the copy says so — and now it is true in the way people
 * assumed it was. Moving the dates moves the plan: every trip day and every
 * placed thing shifts by the same delta, so Day 2 is still Day 2 on its new
 * date. What the copy still may not promise is that a shorter trip keeps
 * everything — days pushed off the end lose their placements, which is why the
 * confirmation modal exists (DateShiftWarningModal) rather than a line here.
 *
 * A length chip is the third way in, for the trip that has a starting day and a
 * shape but no return flight yet — it fills the first day with today if you
 * have not picked one, because a length has to count from something.
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

  // Arriving with dates already set means this gate was reopened by "Change
  // dates" over a day list that exists — so backing out of it lands on those
  // days, not on the ideas board. Only the trip with no dates at all has
  // nowhere to go back to but the ideas the days will be filled from, and the
  // button has to say which of the two it is doing.
  const reopened = Boolean(initialStart && initialEnd);

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
          <h2 className={styles.title}>When are you going?</h2>
          <p className={styles.body}>
            Days come from your dates. Rough is fine — you can change them later, and your plan moves with
            them, so Day 2 stays Day 2.
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
            {reopened ? 'Back to your days' : 'Back to ideas'}
          </Button>
          <Button disabled={!ready || saving} aria-busy={saving || undefined} onClick={() => onConfirm(start, end)}>
            Open the days
          </Button>
        </div>
      </div>
    </div>
  );
}
