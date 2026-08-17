import type { ReactNode } from 'react';
import type { PlanRow, RowState, RowTone } from './dayPlan';
import styles from './ScheduleRow.module.css';

export interface ScheduleRowProps {
  row: PlanRow;
  /** "Decide on the night" options, rendered under the meta line. */
  options?: ReactNode;
}

const TONE_CLASS: Record<RowTone, string> = {
  decided: styles.dotDecided,
  waiting: styles.dotWaiting,
  destination: styles.dotDestination,
};

/**
 * The dot is a shape, so it says nothing. These are the words that go with it,
 * hidden from the page and read aloud after the time. 'upcoming' has none: it
 * is the ordinary case, and a row that announced "upcoming" fourteen times
 * would bury the three that are not.
 */
const STATE_WORD: Record<RowState, string> = {
  past: 'done',
  now: 'now',
  open: 'not decided',
  upcoming: '',
};

function dotClass(state: RowState, tone: RowTone): string {
  // 'open' and 'now' are drawn by the clock and the question, and both outrank
  // the trail colour: a ring means "nobody has decided", a filled halo means
  // "you are standing in this one".
  if (state === 'open') return `${styles.dot} ${styles.dotOpen}`;
  if (state === 'now') return `${styles.dot} ${styles.dotNow}`;
  return `${styles.dot} ${TONE_CLASS[tone]}`;
}

/**
 * One item of the day, as a flat row: when, what, where. No hour grid and no
 * block sized by duration — this is the plan you read walking, held in one
 * hand, and on a phone an absolutely-positioned 24-hour column is a map of
 * empty space with four things in it.
 *
 * Everything here arrives already formatted by `dayPlan.ts`; the row places
 * text and nothing else. Empty fields are ordinary — an item can have no time,
 * no duration and no category — so each one is left out rather than drawn as an
 * empty line, which would otherwise open a gap the eye reads as a missing word.
 */
export function ScheduleRow({ row, options }: ScheduleRowProps) {
  const word = STATE_WORD[row.state];
  const hasWhen = row.time !== '' || row.dur !== '' || word !== '';

  return (
    <div className={styles.row}>
      {hasWhen && (
        <div className={styles.when}>
          {row.time !== '' && (
            <span className={row.state === 'past' ? `${styles.time} ${styles.timePast}` : styles.time}>{row.time}</span>
          )}
          {word !== '' && <span className={styles.srOnly}>{word}</span>}
          {row.dur !== '' && <span className={styles.dur}>{row.dur}</span>}
        </div>
      )}

      <span className={dotClass(row.state, row.tone)} aria-hidden="true" />

      <div className={styles.what}>
        <p className={styles.title}>{row.title}</p>
        {row.meta !== '' && <p className={styles.meta}>{row.meta}</p>}
        {options}
      </div>
    </div>
  );
}
