import { Button } from '../../design/components/core/Button';
import type { NowLine } from './dayPlan';
import styles from './NowBar.module.css';

export interface NowBarProps {
  line: NowLine;
  onOpenNearby: () => void;
  /** True while we are still working out where you are. */
  busy?: boolean;
}

/**
 * The bar along the bottom of the phone: what you are on, until when, and the
 * one sideways question this screen answers — what else is around here.
 *
 * It floats over the day rather than following it, because it is the only thing
 * on this screen you can act on and scrolling to tomorrow morning should not
 * take it away. Both lines truncate: the bar is a fixed band at the bottom of
 * the window, and a long title that wrapped would grow it upward over the row
 * you were reading.
 */
export function NowBar({ line, onOpenNearby, busy = false }: NowBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.lines}>
        <p className={styles.title}>{line.title}</p>
        {line.sub !== '' && <p className={styles.sub}>{line.sub}</p>}
      </div>
      <Button variant="secondary" className={styles.action} onClick={onOpenNearby} disabled={busy}>
        {busy ? 'Finding you…' : "What's nearby"}
      </Button>
    </div>
  );
}
