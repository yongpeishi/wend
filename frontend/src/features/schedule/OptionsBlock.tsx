import type { CSSProperties } from 'react';
import { useEntry, useUpdateScheduleItem } from '../../api';
import type { ScheduleItem } from '../../api/types';
import { formatTimeRange, joinMeta } from '../../lib/formatDates';
import styles from './ScheduleBlock.module.css';

export interface OptionsBlockProps {
  item: ScheduleItem;
  bundleId: number;
  bundleTitle: string;
  style: CSSProperties;
}

/**
 * "5 options for day 1 dinner, I choose which one on the day." The
 * `schedule_item.entry_id` points at a bundle; every member renders as a
 * choice. Tapping one sets `chosen_entry_id` — the others stay visible,
 * dimmed by opacity only, never struck through, and the pick is reversible
 * with a second tap on the same option.
 */
export function OptionsBlock({ item, bundleId, bundleTitle, style }: OptionsBlockProps) {
  const { data } = useEntry(bundleId);
  const updateItem = useUpdateScheduleItem(item.id);
  const members = data?.children ?? [];

  function choose(entryId: number) {
    const next = item.chosen_entry_id === entryId ? null : entryId;
    updateItem.mutate({ chosen_entry_id: next });
  }

  return (
    <div className={styles.block} style={style}>
      <span className={styles.time}>{formatTimeRange(item.starts_at_minutes, item.ends_at_minutes)}</span>
      <p className={styles.optionsTitle}>{bundleTitle} — choose one</p>
      <div className={styles.options}>
        {members.map((member) => {
          const chosen = item.chosen_entry_id === member.id;
          const dimmed = item.chosen_entry_id !== null && !chosen;
          return (
            <button
              key={member.id}
              type="button"
              className={[styles.option, chosen ? styles.optionChosen : '', dimmed ? styles.optionDimmed : ''].join(
                ' ',
              )}
              aria-pressed={chosen}
              onClick={() => choose(member.id)}
            >
              <span>{joinMeta(member.title, member.location_name)}</span>
              {chosen && <span className={styles.chosenMark}>Chosen</span>}
            </button>
          );
        })}
        {members.length === 0 && <p className={styles.meta}>This bundle has no options yet.</p>}
      </div>
    </div>
  );
}
