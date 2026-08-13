import { Button } from '../../design/components/core/Button';
import { formatDuration, formatSpan } from './itineraryModel';
import type { Row } from './itineraryModel';
import styles from './GapRow.module.css';

export type GapRowValue = Extract<Row, { kind: 'gap' }>;

export interface GapRowProps {
  row: GapRowValue;
  /** Opens the picker with this gap's hours already chosen. */
  onFill?: () => void;
  /** Archived versions are shown, not filled. */
  readOnly?: boolean;
}

/**
 * The hole between two placed things, drawn rather than left blank. Gaps are
 * legal — a long open afternoon is a plan, not an error — so this is dashed
 * paper with an offer on it, never a warning. Nothing here is red, and the
 * word "gap" is not used on screen: it reads "Nothing planned".
 */
export function GapRow({ row, onFill, readOnly = false }: GapRowProps) {
  const span = formatSpan(row.startsAtMinutes, row.endsAtMinutes);
  const length = formatDuration(row.endsAtMinutes - row.startsAtMinutes);

  return (
    <div className={styles.gap}>
      <span className={styles.time}>{span}</span>
      <span className={styles.headline}>Nothing planned · {length}</span>
      {onFill && !readOnly && (
        <Button size="small" variant="secondary" className={styles.fill} onClick={onFill}>
          Fill it
        </Button>
      )}
    </div>
  );
}
