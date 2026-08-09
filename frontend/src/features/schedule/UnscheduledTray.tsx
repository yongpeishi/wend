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
}

function TrayCard({ entry, onPlaceAt }: TrayCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `tray-${entry.id}`,
    data: { entry },
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
      className={[styles.card, isDragging ? styles.dragging : ''].filter(Boolean).join(' ')}
      style={style}
      {...attributes}
      {...listeners}
    >
      <HatchPlaceholder size={40} />
      <span className={styles.body}>
        <p className={styles.title}>{entry.title}</p>
        {meta && <p className={styles.meta}>{meta}</p>}
      </span>
      {/* The required non-drag path: drag on a phone is fragile, so every card
       * carries an explicit tap target too. stopPropagation keeps a tap from
       * being swallowed by the drag listeners above. */}
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
    </div>
  );
}

export interface UnscheduledTrayProps {
  entries: Entry[];
  onPlaceAt: (entry: Entry) => void;
}

/**
 * The trip's unplaced ideas, at the bottom of the schedule. Drag a card up
 * into the day column as an accelerator; "Place at…" is the always-available
 * fallback, per the brief ("drag on a phone is fragile").
 */
export function UnscheduledTray({ entries, onPlaceAt }: UnscheduledTrayProps) {
  return (
    <div className={styles.tray}>
      <p className={styles.heading}>Ideas not yet placed</p>
      {entries.length === 0 ? (
        <EmptyState message="Everything's placed. New ideas you add will land here first." />
      ) : (
        <div className={styles.list}>
          {entries.map((entry) => (
            <TrayCard key={entry.id} entry={entry} onPlaceAt={onPlaceAt} />
          ))}
        </div>
      )}
    </div>
  );
}
