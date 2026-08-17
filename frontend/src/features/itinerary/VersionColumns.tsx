import { Button } from '../../design/components/core/Button';
import type { DayVersion } from '../../api/types';
import { joinMeta } from '../../lib/formatDates';
import { dayHours } from './itineraryModel';
import { useVersionDrop } from './useDayDrop';
import type { ItineraryDropHandler } from './useDayDrop';
import { VersionItems } from './VersionItems';
import styles from './VersionColumns.module.css';

export interface VersionColumnsProps {
  /** The day these versions belong to, ISO `YYYY-MM-DD`. Names the drop targets. */
  day: string;
  /** Live versions only, in position order. */
  versions: DayVersion[];
  /** Settles the day on one version; the server archives its siblings. */
  onKeep: (versionId: number) => void;
  onFill?: (versionId: number, slot: { start: number; end: number }) => void;
  onEditTime?: (itemId: number, startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  onRemoveItem?: (itemId: number) => void;
  onAdd?: (versionId: number) => void;
  /** Something from the rail was dropped on one column. Must be in a `<DndContext>`. */
  onDropItem?: ItineraryDropHandler;
  /** `Day 4 · Wed 15`, so a Keep button says which day it settles. */
  dayLabel?: string;
}

/**
 * A split day, side by side. Versions are per day rather than per trip — a
 * whole-trip fork doubles every edit — and both stay live until you keep one.
 *
 * Every column is drawn with the same weight, and every Keep button is the same
 * outline button. The prototype filled the last one solid, which reads as a
 * recommendation the app is in no position to make: the point of a split day is
 * that the two are still being compared.
 *
 * Every column is also a drop target of its own, which is what makes "drag it
 * into Version B" mean Version B rather than whichever version the day would
 * have picked. So this renders inside a `<DndContext>` — see `useDayDrop`.
 */
export function VersionColumns({
  day,
  versions,
  onKeep,
  onFill,
  onEditTime,
  onRemoveItem,
  onAdd,
  onDropItem,
  dayLabel,
}: VersionColumnsProps) {
  return (
    <div className={styles.columns}>
      {versions.map((version) => (
        <VersionColumn
          key={version.id}
          day={day}
          version={version}
          onKeep={onKeep}
          onFill={onFill}
          onEditTime={onEditTime}
          onRemoveItem={onRemoveItem}
          onAdd={onAdd}
          onDropItem={onDropItem}
          dayLabel={dayLabel}
        />
      ))}
    </div>
  );
}

type VersionColumnProps = Omit<VersionColumnsProps, 'versions'> & { version: DayVersion };

/** One column. Separate because a drop target is a hook, and hooks need a component. */
function VersionColumn({
  day,
  version,
  onKeep,
  onFill,
  onEditTime,
  onRemoveItem,
  onAdd,
  onDropItem,
  dayLabel,
}: VersionColumnProps) {
  const { setNodeRef, isOver, dropId } = useVersionDrop(day, version.id, onDropItem);
  const items = version.schedule_items;
  const note = joinMeta(dayHours(items), `${items.length} ${items.length === 1 ? 'thing' : 'things'}`);

  return (
    <div
      ref={setNodeRef}
      className={styles.column}
      data-drop-id={dropId}
      data-drop-target={isOver || undefined}
    >
      <div className={styles.head}>
        <h4 className={styles.name}>{version.name}</h4>
        <span className={styles.note}>{note}</span>
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>Nothing here yet.</p>
      ) : (
        <VersionItems
          items={items}
          onFill={onFill && ((slot) => onFill(version.id, slot))}
          onEditTime={onEditTime}
          onRemoveItem={onRemoveItem}
        />
      )}

      {onAdd && (
        <button type="button" className={styles.add} onClick={() => onAdd(version.id)}>
          + add to {version.name}
        </button>
      )}

      <Button
        variant="secondary"
        className={styles.keep}
        onClick={() => onKeep(version.id)}
        aria-label={
          dayLabel
            ? `Keep ${version.name} for ${dayLabel}, and archive the rest`
            : `Keep ${version.name}, and archive the rest`
        }
      >
        Keep this one
      </Button>
    </div>
  );
}
