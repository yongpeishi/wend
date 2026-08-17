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
  /** May you change this block? Defaults to true, matching a null role. */
  canEdit?: boolean;
}

/**
 * One placed item. Delegates to `<OptionsBlock>` when the item points at a
 * bundle (the "5 dinner options" case) rather than a single idea.
 *
 * The time, the title and the meta line are what the block is; a viewer keeps
 * all three. "Move back to ideas" is the only thing here that changes the plan,
 * so it is the only thing that goes.
 */
export function ScheduleBlock({ item, entry, style, canEdit = true }: ScheduleBlockProps) {
  const deleteItem = useDeleteScheduleItem();

  if (entry?.kind === 'bundle') {
    return (
      <OptionsBlock
        item={item}
        bundleId={entry.id}
        bundleTitle={entry.title}
        style={style}
        canEdit={canEdit}
      />
    );
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
      {canEdit && (
        <button type="button" className={styles.unschedule} onClick={() => deleteItem.mutate(item.id)}>
          Move back to ideas
        </button>
      )}
    </div>
  );
}
