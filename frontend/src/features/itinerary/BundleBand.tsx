import { useState } from 'react';
import { X } from 'lucide-react';
import type { ItineraryItem } from '../../api/types';
import { bundleMemberSpans, formatDuration, formatSpan } from './itineraryModel';
import { TimeEditor } from './TimeEditor';
import styles from './BundleBand.module.css';

export interface BundleBandProps {
  item: ItineraryItem;
  onEditTime?: (startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  /**
   * One member's own hours, by its entry id. Both nulls clear them. Omit to
   * make every member's time column a plain reading.
   */
  onEditMemberTime?: (entryId: number, startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
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
 * Each member has hours of its own on this placement, STORED when someone
 * sets them (`member_times`, sparse — a row only for the members somebody
 * timed). Until anyone has, the column falls back to a DERIVED share of the
 * band's span, and when there is nothing honest to derive from it says
 * "No time yet" rather than inventing a time — the same words a loose idea
 * uses, so a member and a loose idea keep reading alike. `bundleMemberSpans`
 * holds the rules; this only draws what it returns.
 *
 * The member's time is its control, exactly as on ItemLine: clicking the mono
 * column opens the editor in place of that member's row, prefilled with
 * whatever the column was showing — a derived share is a fine place to start
 * from. The band's own span stays separately editable from its head, and the
 * two editors know nothing of each other.
 */
export function BundleBand({ item, onEditTime, onEditMemberTime, onRemove, readOnly = false }: BundleBandProps) {
  const [editing, setEditing] = useState(false);
  /** The member whose editor is open, by entry id. One at a time. */
  const [editingMember, setEditingMember] = useState<number | null>(null);

  const title = item.entry?.title ?? 'Plan';
  const span = formatSpan(item.starts_at_minutes, item.ends_at_minutes);
  const canEditTime = Boolean(onEditTime) && !readOnly;
  const canEditMemberTime = Boolean(onEditMemberTime) && !readOnly;
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
        const startsAt = slot?.startsAtMinutes ?? null;
        const endsAt = slot?.endsAtMinutes ?? null;
        const memberSpan = formatSpan(startsAt, endsAt);

        if (editingMember === member.id && canEditMemberTime && onEditMemberTime) {
          return (
            <TimeEditor
              key={member.id}
              title={member.title}
              startsAtMinutes={startsAt}
              endsAtMinutes={endsAt}
              onCancel={() => setEditingMember(null)}
              onSave={(start, end) => {
                setEditingMember(null);
                onEditMemberTime(member.id, start, end);
              }}
            />
          );
        }

        return (
          <div key={member.id} className={styles.member}>
            {canEditMemberTime ? (
              <button
                type="button"
                className={[styles.memberTime, styles.memberTimeButton].join(' ')}
                onClick={() => setEditingMember(member.id)}
                aria-label={
                  memberSpan
                    ? `Change the hours for ${member.title}, now ${memberSpan}`
                    : `Set the hours for ${member.title}`
                }
              >
                {memberSpan || 'No time yet'}
              </button>
            ) : (
              <span className={styles.memberTime}>{memberSpan || 'No time yet'}</span>
            )}
            <span className={styles.memberTitle}>{member.title}</span>
            <span className={styles.memberMeta}>
              {formatDuration(member.duration_minutes)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
