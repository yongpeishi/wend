import { Bed, ChevronDown } from 'lucide-react';
import { Tag } from '../../design/components/core/Chip';
import { DayStateDot } from './DayStateDot';
import { dayHours, daySummary } from './itineraryModel';
import type { ItineraryDay } from './itineraryModel';
import { SwapDayMenu } from './SwapDayMenu';
import type { SwapDayChoice } from './SwapDayMenu';
import { useDayDrop } from './useDayDrop';
import styles from './DayRow.module.css';

export interface DayRowProps {
  day: ItineraryDay;
  /** The container's own reading of the drag — the row also lights up on its own. */
  isDropTarget?: boolean;
  /** Every day of the trip, for the swap menu. Omitted, no swap is offered. */
  swapChoices?: SwapDayChoice[];
  onToggle: () => void;
  /** Something from the rail was dropped here. Must be inside a `<DndContext>`. */
  onDropItem?: (entryId: number) => void;
  /** Exchange this day with another date of the trip. Needs `swapChoices`. */
  onSwapDay?: (otherDay: string) => void;
}

/**
 * A closed day: one row, three columns. Day label on the left, everything the
 * day has to say in a middle cell that clips, and the chevron in a column of
 * its own so it can never be cut off however long the summary runs.
 *
 * Opening it is a click anywhere in the row — the design's gesture, and it
 * makes the drop target and the click target the same shape. Which is why the
 * lodging here is a static pill rather than the interactive `LodgingPill`:
 * changing where you sleep is a job for the open day.
 *
 * The row is therefore a `<button>` filling a wrapper, not the wrapper itself.
 * Buttons do not nest, and the swap menu is a button that has to sit in the
 * row without being swallowed by the toggle around it. The wrapper is what
 * carries the day's drop target and its outline; the button carries the
 * gesture.
 */
export function DayRow({ day, isDropTarget = false, swapChoices = [], onToggle, onDropItem, onSwapDay }: DayRowProps) {
  const { setNodeRef, isOver, dropId } = useDayDrop(day.day, onDropItem);
  const items = day.versions[0]?.schedule_items ?? [];
  const summary = daySummary(items);
  const hours = dayHours(items);
  const split = day.versions.length > 1;

  return (
    <div
      ref={setNodeRef}
      className={styles.row}
      data-drop-id={dropId}
      data-drop-target={isDropTarget || isOver || undefined}
      data-empty={items.length === 0 || undefined}
    >
      <button type="button" className={styles.toggle} aria-expanded={false} onClick={onToggle}>
        <span className={styles.lead}>
          <DayStateDot day={day} />
          <span className={styles.label}>{day.label}</span>
        </span>

        <span className={styles.middle}>
          <span className={styles.summary} data-empty={summary ? undefined : true}>
            {summary || 'Nothing here yet'}
          </span>

          {split && (
            <Tag tone="saved" className={styles.status}>
              {day.versions.length} versions · not settled
            </Tag>
          )}

          {day.lodgingTitle && (
            <span className={styles.lodging}>
              <Bed size={15} strokeWidth={1.5} aria-hidden="true" className={styles.bed} />
              <span className={styles.lodgingTitle}>{day.lodgingTitle}</span>
            </span>
          )}

          {hours && <span className={styles.hours}>{hours}</span>}
        </span>

        <ChevronDown size={20} strokeWidth={1.5} aria-hidden="true" className={styles.chevron} />
      </button>

      {onSwapDay && (
        <SwapDayMenu
          day={day.day}
          dayLabel={day.label}
          choices={swapChoices}
          onSwap={onSwapDay}
          className={styles.swap}
        />
      )}
    </div>
  );
}
