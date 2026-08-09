import type { Entry, ScheduleItem } from '../../api/types';
import { formatMinutes } from '../../lib/formatDates';
import { EmptyState } from '../../components/EmptyState';
import { entryFor, isTransportItem, sortDayItems } from './scheduleModel';
import { ScheduleBlock } from './ScheduleBlock';
import { TransportSegment } from './TransportSegment';
import styles from './DayColumn.module.css';

const HOUR_PX = 64;
const MIN_BLOCK_PX = 48;

function topPx(minutes: number): number {
  return (minutes / 60) * HOUR_PX;
}

function heightPx(startMinutes: number, endMinutes: number | null): number {
  if (endMinutes === null || endMinutes <= startMinutes) return MIN_BLOCK_PX;
  return Math.max(MIN_BLOCK_PX, ((endMinutes - startMinutes) / 60) * HOUR_PX);
}

export interface DayColumnProps {
  items: ScheduleItem[];
  entries: Entry[];
}

/**
 * The hour-by-hour grid for a single day: hours down the left in 24-hour
 * `HH:MM` (the `Data` type role, sized to survive bright sun), items placed
 * as blocks sized by duration, transport slots as dotted trail segments.
 */
export function DayColumn({ items, entries }: DayColumnProps) {
  const ordered = sortDayItems(items);
  const timed = ordered.filter((item) => item.starts_at_minutes !== null);
  const untimed = ordered.filter((item) => item.starts_at_minutes === null);

  if (items.length === 0) {
    return <EmptyState message="Nothing placed yet. Drag something over from your ideas." />;
  }

  return (
    <div>
      {untimed.length > 0 && (
        <div className={styles.untimed}>
          <p className={styles.untimedLabel}>Placed on this day, no time yet</p>
          {untimed.map((item) => (
            <ScheduleBlock
              key={item.id}
              item={item}
              entry={entryFor(entries, item.entry_id)}
              style={{ position: 'static' }}
            />
          ))}
        </div>
      )}

      <div className={styles.scroll}>
        <div className={styles.grid} style={{ height: 24 * HOUR_PX }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div className={styles.hourRow} key={hour}>
              <span className={styles.hourLabel}>{formatMinutes(hour * 60)}</span>
            </div>
          ))}
          <div className={styles.lane}>
            {timed.map((item) => {
              const start = item.starts_at_minutes as number;
              const end = item.ends_at_minutes;
              const top = topPx(start);
              const height = heightPx(start, end);
              const style = { top, height };
              if (isTransportItem(item, entries)) {
                return (
                  <TransportSegment
                    key={item.id}
                    entry={entryFor(entries, item.entry_id)}
                    style={style}
                    heightPx={height}
                  />
                );
              }
              return <ScheduleBlock key={item.id} item={item} entry={entryFor(entries, item.entry_id)} style={style} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
