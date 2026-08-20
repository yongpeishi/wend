import { useState } from 'react';
import { X } from 'lucide-react';
import type { ItineraryItem } from '../../api/types';
import { joinMeta } from '../../lib/formatDates';
import { bundleMemberSpans, formatDuration, formatSpan } from './itineraryModel';
import { TimeEditor } from './TimeEditor';
import styles from './BundleBand.module.css';

export interface BundleBandProps {
  item: ItineraryItem;
  onEditTime?: (startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  /** Takes the whole bundle off the day. The bundle entry itself is untouched. */
  onRemove?: () => void;
  /** Archived versions are shown, not edited. */
  readOnly?: boolean;
}

/**
 * A bundle on a day: a tinted band wrapping its members' lines, labelled
 * `PLAN · NAME`. The tint is deliberately quiet — grouping is
 * sub-information, not hierarchy, so the band adds no border, no heavier type
 * and no shadow, and each member line is drawn exactly like a loose idea.
 *
 * Members carry no hours of their own — the model gives a bundle one span and
 * no rows of its own per member. But a blank time column turns a member into an
 * indented orphan and breaks the one rule the layout exists to keep, so each
 * member's hours are DERIVED FOR DISPLAY by `bundleMemberSpans`: the band's span
 * divided between them. Nothing here is stored, and the band's own span stays
 * the thing you click to change the hours — a derived time is not an editable
 * one.
 */
export function BundleBand({ item, onEditTime, onRemove, readOnly = false }: BundleBandProps) {
  const [editing, setEditing] = useState(false);

  const title = item.entry?.title ?? 'Plan';
  const span = formatSpan(item.starts_at_minutes, item.ends_at_minutes);
  const canEditTime = Boolean(onEditTime) && !readOnly;
  const memberSpans = bundleMemberSpans(item);

  return (
    <div className={styles.band}>
      <div className={styles.head}>
        <span className={styles.label}>Plan · {title}</span>

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

      {item.members.map((member, index) => {
        const slot = memberSpans[index];
        return (
          <div key={member.id} className={styles.member}>
            <span className={styles.memberTime}>
              {formatSpan(slot?.startsAtMinutes ?? null, slot?.endsAtMinutes ?? null)}
            </span>
            <span className={styles.memberTitle}>{member.title}</span>
            <span className={styles.memberMeta}>
              {joinMeta(member.location_name, formatDuration(member.duration_minutes))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
