import type { CSSProperties } from 'react';
import { useDeleteScheduleItem } from '../../api';
import type { Entry, ScheduleItem } from '../../api/types';
import { formatDuration, formatTimeRange, joinMeta } from '../../lib/formatDates';
import { OptionsBlock } from './OptionsBlock';
import styles from './ScheduleBlock.module.css';

export interface ScheduleBlockProps {
  item: ScheduleItem;
  entry: Entry | undefined;
  style: CSSProperties;
}

/**
 * One placed item. Delegates to `<OptionsBlock>` when the item points at a
 * bundle (the "5 dinner options" case) rather than a single idea.
 */
export function ScheduleBlock({ item, entry, style }: ScheduleBlockProps) {
  const deleteItem = useDeleteScheduleItem();

  if (entry?.kind === 'bundle') {
    return <OptionsBlock item={item} bundleId={entry.id} bundleTitle={entry.title} style={style} />;
  }

  const meta = joinMeta(
    entry?.category ?? undefined,
    entry?.location_name ?? undefined,
    formatDuration(entry?.duration_minutes ?? null) ?? undefined,
  );

  return (
    <div className={styles.block} style={style}>
      <span className={styles.time}>{formatTimeRange(item.starts_at_minutes, item.ends_at_minutes)}</span>
      <p className={styles.title}>{entry?.title ?? 'Untitled'}</p>
      {meta && <p className={styles.meta}>{meta}</p>}
      <button type="button" className={styles.unschedule} onClick={() => deleteItem.mutate(item.id)}>
        Move back to ideas
      </button>
    </div>
  );
}
