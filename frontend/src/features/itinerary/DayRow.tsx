import { Bed, ChevronDown } from 'lucide-react';
import { Tag } from '../../design/components/core/Chip';
import { DayStateDot } from './DayStateDot';
import { dayHours, daySummary } from './itineraryModel';
import type { ItineraryDay } from './itineraryModel';
import { useDayDrop } from './useDayDrop';
import styles from './DayRow.module.css';

export interface DayRowProps {
  day: ItineraryDay;
  /** The container's own reading of the drag — the row also lights up on its own. */
  isDropTarget?: boolean;
  onToggle: () => void;
  /** Something from the rail was dropped here. Must be inside a `<DndContext>`. */
  onDropItem?: (entryId: number) => void;
}

/**
 * A closed day: one row, three columns. Day label on the left, everything the
 * day has to say in a middle cell that clips, and the chevron in a column of
 * its own so it can never be cut off however long the summary runs.
 *
 * The whole row is the toggle — the design's gesture, and it makes the drop
 * target and the click target the same shape. Which is why the lodging here is
 * a static pill rather than the interactive `LodgingPill`: a button cannot
 * live inside a button, and changing where you sleep is a job for the open
 * day.
 */
export function DayRow({ day, isDropTarget = false, onToggle, onDropItem }: DayRowProps) {
  const { setNodeRef, isOver } = useDayDrop(day.day, onDropItem);
  const items = day.versions[0]?.schedule_items ?? [];
  const summary = daySummary(items);
  const hours = dayHours(items);
  const split = day.versions.length > 1;

  return (
    <button
      type="button"
      ref={setNodeRef}
      className={styles.row}
      data-drop-target={isDropTarget || isOver || undefined}
      data-empty={items.length === 0 || undefined}
      aria-expanded={false}
      onClick={onToggle}
    >
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
  );
}
