import type { ItineraryItem } from '../../api/types';
import { BundleBand } from './BundleBand';
import { GapRow } from './GapRow';
import { ItemLine } from './ItemLine';
import { withGaps } from './itineraryModel';
import styles from './VersionItems.module.css';

export interface VersionItemsProps {
  items: ItineraryItem[];
  /** Opens the picker over the hours the gap leaves free. */
  onFill?: (slot: { start: number; end: number }) => void;
  onEditTime?: (itemId: number, startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  onRemoveItem?: (itemId: number) => void;
  onUngroup?: (itemId: number) => void;
  /** Archived versions are shown, not edited. */
  readOnly?: boolean;
}

/**
 * One version's running order: its items in clock order with the holes between
 * them drawn in. Shared by the open day, the side-by-side version columns and
 * the archived panel so all three read identically — the only difference
 * between them is which callbacks arrive.
 */
export function VersionItems({
  items,
  onFill,
  onEditTime,
  onRemoveItem,
  onUngroup,
  readOnly = false,
}: VersionItemsProps) {
  return (
    <div className={styles.rows}>
      {withGaps(items).map((row) => {
        if (row.kind === 'gap') {
          return (
            <GapRow
              key={`gap-${row.startsAtMinutes}-${row.endsAtMinutes}`}
              row={row}
              readOnly={readOnly}
              onFill={onFill && (() => onFill({ start: row.startsAtMinutes, end: row.endsAtMinutes }))}
            />
          );
        }

        const { item } = row;
        if (item.entry?.kind === 'bundle') {
          return (
            <BundleBand
              key={item.id}
              item={item}
              readOnly={readOnly}
              onUngroup={onUngroup && (() => onUngroup(item.id))}
              onEditTime={onEditTime && ((start, end) => onEditTime(item.id, start, end))}
              onRemove={onRemoveItem && (() => onRemoveItem(item.id))}
            />
          );
        }

        return (
          <ItemLine
            key={item.id}
            item={item}
            readOnly={readOnly}
            onEditTime={onEditTime && ((start, end) => onEditTime(item.id, start, end))}
            onRemove={onRemoveItem && (() => onRemoveItem(item.id))}
          />
        );
      })}
    </div>
  );
}
