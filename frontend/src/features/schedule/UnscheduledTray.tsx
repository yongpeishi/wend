import { useDraggable } from '@dnd-kit/core';
import type { Entry } from '../../api/types';
import { HatchPlaceholder } from '../../components/HatchPlaceholder';
import { Button } from '../../design/components/core/Button';
import { EmptyState } from '../../components/EmptyState';
import { formatDuration, joinMeta } from '../../lib/formatDates';
import styles from './UnscheduledTray.module.css';

interface TrayCardProps {
  entry: Entry;
  onPlaceAt: (entry: Entry) => void;
  canEdit: boolean;
}

function TrayCard({ entry, onPlaceAt, canEdit }: TrayCardProps) {
  // Disabled at the source rather than ignored at the drop: a card that lifts
  // under the finger and then snaps back has already told the reader they can
  // move it. `useDraggable` still has to be called — hooks are not optional —
  // so the switch goes inside it.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `tray-${entry.id}`,
    data: { entry },
    disabled: !canEdit,
  });
  const meta = joinMeta(
    entry.kind === 'bundle' ? 'Options' : (entry.category ?? undefined),
    entry.location_name ?? undefined,
    formatDuration(entry.duration_minutes) ?? undefined,
  );
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      className={[styles.card, canEdit ? '' : styles.cardStill, isDragging ? styles.dragging : '']
        .filter(Boolean)
        .join(' ')}
      style={style}
      {...(canEdit ? attributes : {})}
      {...(canEdit ? listeners : {})}
    >
      <HatchPlaceholder size={40} />
      <span className={styles.body}>
        <p className={styles.title}>{entry.title}</p>
        {meta && <p className={styles.meta}>{meta}</p>}
      </span>
      {/* The required non-drag path: drag on a phone is fragile, so every card
       * carries an explicit tap target too. stopPropagation keeps a tap from
       * being swallowed by the drag listeners above. */}
      {canEdit && (
        <Button
          variant="onDark"
          onClick={(event) => {
            event.stopPropagation();
            onPlaceAt(entry);
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          Place at…
        </Button>
      )}
    </div>
  );
}

export interface UnscheduledTrayProps {
  entries: Entry[];
  onPlaceAt: (entry: Entry) => void;
  /** May you place these? Defaults to true, matching a null role. */
  canEdit?: boolean;
}

/**
 * The trip's unplaced ideas, at the bottom of the schedule. Drag a card up
 * into the day column as an accelerator; "Place at…" is the always-available
 * fallback, per the brief ("drag on a phone is fragile").
 *
 * The tray itself stays for a viewer, cards and all: what is still unplaced is
 * as much a part of where a trip has got to as what is on the grid above. Both
 * ways of moving one go — the drag and the button — because a card that lifts
 * and then refuses is worse than one that simply sits still.
 */
export function UnscheduledTray({ entries, onPlaceAt, canEdit = true }: UnscheduledTrayProps) {
  return (
    <div className={styles.tray}>
      <p className={styles.heading}>Ideas not yet placed</p>
      {entries.length === 0 ? (
        <EmptyState message="Everything's placed. New ideas you add will land here first." />
      ) : (
        <div className={styles.list}>
          {entries.map((entry) => (
            <TrayCard key={entry.id} entry={entry} onPlaceAt={onPlaceAt} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
