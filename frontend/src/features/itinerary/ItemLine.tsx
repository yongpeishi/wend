import { useState } from 'react';
import { X } from 'lucide-react';
import type { ItineraryItem } from '../../api/types';
import { joinMeta } from '../../lib/formatDates';
import { formatSpan } from './itineraryModel';
import { TimeEditor } from './TimeEditor';
import styles from './ItemLine.module.css';

export interface ItemLineProps {
  item: ItineraryItem;
  /** Minutes from midnight. Omit to make the hours unchangeable. */
  onEditTime?: (startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  /** Takes it off the day. The kept idea itself is untouched — nothing here is used up. */
  onRemove?: () => void;
  /** Archived versions are shown, not edited. */
  readOnly?: boolean;
}

/**
 * One placed thing, as one line: its hours in mono in a fixed column, its
 * title, its metadata. A bundle member and a loose idea look identical — flat
 * visual weight is the whole point of the layout (itinerary-decisions.md).
 *
 * The time itself is the control. Clicking the mono column opens the editor in
 * place, which keeps a dense row free of a second icon button and gives the
 * hours an obvious way in for a keyboard as well as a pointer. An untimed item
 * says so in the same column rather than leaving it blank, so the way to set
 * the hours is visible on the day something is dropped onto a day.
 */
export function ItemLine({ item, onEditTime, onRemove, readOnly = false }: ItemLineProps) {
  const [editing, setEditing] = useState(false);

  const title = item.entry?.title ?? 'Something kept';
  const span = formatSpan(item.starts_at_minutes, item.ends_at_minutes);
  const meta = joinMeta(item.note);
  const canEditTime = Boolean(onEditTime) && !readOnly;

  if (editing && onEditTime) {
    return (
      <div className={styles.wrap}>
        <TimeEditor
          title={title}
          startsAtMinutes={item.starts_at_minutes}
          endsAtMinutes={item.ends_at_minutes}
          onCancel={() => setEditing(false)}
          onSave={(start, end) => {
            setEditing(false);
            onEditTime(start, end);
          }}
        />
      </div>
    );
  }

  return (
    <div className={styles.line}>
      {canEditTime ? (
        <button
          type="button"
          className={[styles.time, styles.timeButton].join(' ')}
          onClick={() => setEditing(true)}
          aria-label={span ? `Change the hours for ${title}, now ${span}` : `Set the hours for ${title}`}
        >
          {span || 'No time yet'}
        </button>
      ) : (
        <span className={styles.time}>{span || 'No time yet'}</span>
      )}

      <span className={styles.title}>{title}</span>
      {meta && <span className={styles.meta}>{meta}</span>}

      {onRemove && !readOnly && (
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          aria-label={`Take ${title} off this day`}
        >
          <X size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
