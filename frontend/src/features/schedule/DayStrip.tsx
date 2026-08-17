import type { DayChip } from './dayPlan';
import styles from './DayStrip.module.css';

export interface DayStripProps {
  chips: DayChip[];
  activeDay: string;
  onSelect: (day: string) => void;
  'aria-label'?: string;
}

/**
 * The days of the trip, as a run of chips you thumb sideways.
 *
 * Not a `TabBar`: that control is a roving-tabindex tablist for three or four
 * fixed views, and a fortnight's worth of dates in it would be a tab strip you
 * arrow through one day at a time. These are plain buttons in a `<nav>` — every
 * day is its own Tab stop, which is what you want when there are fourteen of
 * them and the one you are after is the eleventh.
 *
 * Each chip carries two lines, and the accessible name spells them as one
 * phrase ("MON 13"). Left to the DOM they would run together — the two lines
 * are stacked by the stylesheet, and a screen reader reading the raw text would
 * say "MON13".
 */
export function DayStrip({ chips, activeDay, onSelect, 'aria-label': ariaLabel = 'Days' }: DayStripProps) {
  return (
    <nav className={styles.strip} aria-label={ariaLabel}>
      {chips.map((chip) => {
        const active = chip.day === activeDay;
        return (
          <button
            key={chip.day}
            type="button"
            className={active ? `${styles.chip} ${styles.chipActive}` : styles.chip}
            aria-label={`${chip.dow} ${chip.date}`}
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(chip.day)}
          >
            <span className={styles.dow}>{chip.dow}</span>
            <span className={styles.date}>{chip.date}</span>
          </button>
        );
      })}
    </nav>
  );
}
