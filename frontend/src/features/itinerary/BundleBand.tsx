import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../design/components/core/Button';
import type { ItineraryItem } from '../../api/types';
import { formatDuration, joinMeta } from '../../lib/formatDates';
import { formatSpan } from './itineraryModel';
import { TimeEditor } from './TimeEditor';
import styles from './BundleBand.module.css';

export interface BundleBandProps {
  item: ItineraryItem;
  /** Splits the bundle into one item per member, in place. */
  onUngroup?: () => void;
  onEditTime?: (startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  /** Takes the whole bundle off the day. The bundle entry itself is untouched. */
  onRemove?: () => void;
  /** Archived versions are shown, not edited. */
  readOnly?: boolean;
}

/**
 * A bundle on a day: a tinted band wrapping its members' lines, labelled
 * `BUNDLE · NAME`. The tint is deliberately quiet — grouping is
 * sub-information, not hierarchy, so the band adds no border, no heavier type
 * and no shadow, and each member line is drawn exactly like a loose idea.
 *
 * Members carry no hours of their own: the model gives a bundle one span and
 * the server divides it only when you ungroup (contract §2). So a member line
 * shows what it is and where, and the band above it holds the clock — which is
 * also why the band's span is the thing you click to change the hours.
 */
export function BundleBand({ item, onUngroup, onEditTime, onRemove, readOnly = false }: BundleBandProps) {
  const [editing, setEditing] = useState(false);

  const title = item.entry?.title ?? 'Bundle';
  const span = formatSpan(item.starts_at_minutes, item.ends_at_minutes);
  const canEditTime = Boolean(onEditTime) && !readOnly;

  return (
    <div className={styles.band}>
      <div className={styles.head}>
        <span className={styles.label}>Bundle · {title}</span>

        {canEditTime ? (
          <button
            type="button"
            className={[styles.span, styles.spanButton].join(' ')}
            onClick={() => setEditing(true)}
            aria-label={span ? `Change the hours for ${title}, now ${span}` : `Set the hours for ${title}`}
          >
            {span || 'No time yet'}
          </button>
        ) : (
          <span className={styles.span}>{span || 'No time yet'}</span>
        )}

        {onUngroup && !readOnly && (
          <Button size="small" variant="quiet" className={styles.ungroup} onClick={onUngroup}>
            Ungroup
          </Button>
        )}

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

      {editing && onEditTime && (
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
      )}

      {item.members.map((member) => (
        <div key={member.id} className={styles.member}>
          <span className={styles.memberTime} aria-hidden="true" />
          <span className={styles.memberTitle}>{member.title}</span>
          <span className={styles.memberMeta}>
            {joinMeta(member.location_name, formatDuration(member.duration_minutes))}
          </span>
        </div>
      ))}
    </div>
  );
}
