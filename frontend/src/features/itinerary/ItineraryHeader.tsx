import { Button } from '../../design/components/core/Button';
import styles from './ItineraryHeader.module.css';

export interface ItineraryHeaderProps {
  /** `12 Oct–17 Oct · 6 days`. */
  meta: string;
  /** `2 days split · not settled`, or null when nothing is split. */
  splitLine?: string | null;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onChangeDates: () => void;
}

/**
 * The screen's head: what the trip's dates are, whether anything is still
 * unsettled, and the three things you do to the whole list.
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
        <h1 className={styles.title}>Itinerary</h1>
        <p className={styles.meta}>
          <span className={styles.dates}>{meta}</span>
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
