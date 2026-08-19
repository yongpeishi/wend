import { Bed } from 'lucide-react';
import { Chip } from '../../design/components/core/Chip';
import styles from './LodgingPill.module.css';

export interface LodgingPillProps {
  /** The resolved lodging title, or null when the night is still unspoken for. */
  title: string | null;
  onClick: () => void;
}

/**
 * Where you sleep, in the day's header. Lodging has no hours — it is a
 * property of the night, not an item on the day — so it never joins the
 * running order (itinerary-decisions.md, option 4c).
 *
 * One of the two places bister is allowed to mean something: lodging and
 * archived. Set, it is the saved chip in bister; unset, a dashed outline of the same
 * shape, so the day header keeps its rhythm either way. A true chip, so this is
 * one of the two things on the screen that keeps --radius-pill.
 */
export function LodgingPill({ title, onClick }: LodgingPillProps) {
  if (title) {
    return (
      <Chip
        tone="saved"
        className={styles.pill}
        onClick={onClick}
        aria-label={`Where you sleep: ${title}. Change it.`}
      >
        <Bed size={15} strokeWidth={1.5} aria-hidden="true" className={styles.icon} />
        <span className={styles.title}>{title}</span>
      </Chip>
    );
  }

  return (
    <button type="button" className={styles.empty} onClick={onClick} aria-label="Say where you sleep">
      <Bed size={15} strokeWidth={1.5} aria-hidden="true" className={styles.iconEmpty} />
      <span>+ where you sleep</span>
    </button>
  );
}
