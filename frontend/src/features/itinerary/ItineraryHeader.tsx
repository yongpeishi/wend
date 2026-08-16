import { Button } from '../../design/components/core/Button';
import styles from './ItineraryHeader.module.css';

export interface ItineraryHeaderProps {
  /** `6 days`. Not the date range — the trip shell already prints that. */
  meta: string;
  /** `2 days split · not settled`, or null when nothing is split. */
  splitLine?: string | null;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onChangeDates: () => void;
}

/**
 * The screen's head: how long the trip runs, whether anything is still
 * unsettled, and the three things you do to the whole list.
 *
 * It names a section, not the page — TripLayout above it holds the trip's
 * title as the one `<h1>` and prints the date range under it, so neither is
 * repeated here. Hence `<h2>`, styled like every other section heading in the
 * product (TripsList's .sectionLabel, BundlePanel's).
 *
 * Unsettled work is signalled once and never nagged about — the split line
 * simply is not there when nothing is split, and when it is, it states the
 * count in plum and stops. No warning colour, no count badge, no "finish this".
 */
export function ItineraryHeader({
  meta,
  splitLine,
  onExpandAll,
  onCollapseAll,
  onChangeDates,
}: ItineraryHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titles}>
        <h2 className={styles.title}>Itinerary</h2>
        <p className={styles.meta}>
          <span className={styles.length}>{meta}</span>
          {splitLine && <span className={styles.split}>{splitLine}</span>}
        </p>
      </div>

      <div className={styles.actions}>
        <Button size="small" variant="quiet" onClick={onExpandAll}>
          Expand all
        </Button>
        <Button size="small" variant="quiet" onClick={onCollapseAll}>
          Collapse all
        </Button>
        <Button size="small" variant="secondary" onClick={onChangeDates}>
          Change dates
        </Button>
      </div>
    </header>
  );
}
