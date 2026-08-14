import { useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { Button } from '../../design/components/core/Button';
import { Tag } from '../../design/components/core/Chip';
import type { EntrySummary } from '../../api/types';
import { AddPicker } from './AddPicker';
import { DayStateDot } from './DayStateDot';
import { formatSpan } from './itineraryModel';
import type { ItineraryDay } from './itineraryModel';
import { LodgingEditor } from './LodgingEditor';
import { LodgingPill } from './LodgingPill';
import { useDayDrop } from './useDayDrop';
import { VersionColumns } from './VersionColumns';
import { VersionItems } from './VersionItems';
import styles from './DayCard.module.css';

/** Which version the picker is filling, and over which hours if it came from a gap. */
interface PickerTarget {
  versionId: number;
  slot: { start: number; end: number } | null;
}

export interface DayCardProps {
  day: ItineraryDay;
  /** Kept places the lodging editor offers. */
  lodgingChoices?: EntrySummary[];
  /** Kept ideas and bundles that sit in no live version yet. */
  addChoices?: EntrySummary[];
  /** The container's own reading of the drag — the card also lights up on its own. */
  isDropTarget?: boolean;
  onToggle: () => void;
  /** Copies the last live version as the next letter; both stay live. */
  onFork: () => void;
  onKeepVersion: (versionId: number) => void;
  /**
   * `slot` is null for "add to this day" — the container picks the hours with
   * `nextFreeSlot` — and set when the request came from a gap, which already
   * knows exactly which hours it is offering.
   */
  onAddItem: (versionId: number, entryId: number, slot: { start: number; end: number } | null) => void;
  onEditTime: (itemId: number, startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  onRemoveItem: (itemId: number) => void;
  /** Both keys together: one clears the other, and both null clears the night. */
  onSetLodging: (value: { lodging_entry_id: number | null; lodging_label: string | null }) => void;
  /** Something from the rail was dropped here. Must be inside a `<DndContext>`. */
  onDropItem?: (entryId: number) => void;
}

/**
 * An open day. The header carries what the day is — its number, whether it is
 * split, where you sleep — and the body carries the running order: one column
 * while the day has a single version, side-by-side columns once it is forked.
 *
 * Everything that changes the day is a callback: this draws, the container
 * decides. The one piece of state it keeps is which panel is showing (the
 * lodging editor, the picker), because that is a property of this card on this
 * screen and nothing else needs to know.
 */
export function DayCard({
  day,
  lodgingChoices = [],
  addChoices = [],
  isDropTarget = false,
  onToggle,
  onFork,
  onKeepVersion,
  onAddItem,
  onEditTime,
  onRemoveItem,
  onSetLodging,
  onDropItem,
}: DayCardProps) {
  const { setNodeRef, isOver } = useDayDrop(day.day, onDropItem);
  const [lodgingOpen, setLodgingOpen] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  const split = day.versions.length > 1;
  const firstVersion = day.versions[0];

  return (
    <div
      ref={setNodeRef}
      className={styles.card}
      data-drop-target={isDropTarget || isOver || undefined}
    >
      <div className={styles.head}>
        <DayStateDot day={day} />
        <h3 className={styles.label}>{day.label}</h3>

        {split && (
          <Tag tone="saved" className={styles.status}>
            {day.versions.length} versions · not settled
          </Tag>
        )}

        <LodgingPill title={day.lodgingTitle} onClick={() => setLodgingOpen((open) => !open)} />

        <span className={styles.headActions}>
          {/* One live version: forking makes a second. Already split: the same
              action adds another way to spend the day, so the verb changes but
              the endpoint does not. */}
          <Button size="small" variant="secondary" onClick={onFork}>
            {split ? 'Add another' : 'Fork this day'}
          </Button>

          <button
            type="button"
            className={styles.close}
            onClick={onToggle}
            aria-expanded
            aria-label={`Close ${day.label}`}
          >
            <ChevronUp size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </span>
      </div>

      {lodgingOpen && (
        <LodgingEditor
          choices={lodgingChoices}
          current={{ entryId: day.lodgingEntryId, label: day.lodgingLabel }}
          onClose={() => setLodgingOpen(false)}
          onPick={(entryId) => {
            setLodgingOpen(false);
            onSetLodging({ lodging_entry_id: entryId, lodging_label: null });
          }}
          onFreeText={(label) => {
            setLodgingOpen(false);
            onSetLodging({ lodging_entry_id: null, lodging_label: label });
          }}
          onClear={() => {
            setLodgingOpen(false);
            onSetLodging({ lodging_entry_id: null, lodging_label: null });
          }}
        />
      )}

      {split ? (
        <VersionColumns
          versions={day.versions}
          dayLabel={day.label}
          onKeep={onKeepVersion}
          onEditTime={onEditTime}
          onRemoveItem={onRemoveItem}
          onAdd={(versionId) => setPicker({ versionId, slot: null })}
          onFill={(versionId, slot) => setPicker({ versionId, slot })}
        />
      ) : (
        firstVersion && (
          <>
            <VersionItems
              items={firstVersion.schedule_items}
              onEditTime={onEditTime}
              onRemoveItem={onRemoveItem}
              onFill={(slot) => setPicker({ versionId: firstVersion.id, slot })}
            />
            <button
              type="button"
              className={styles.add}
              onClick={() => setPicker({ versionId: firstVersion.id, slot: null })}
            >
              + add to this day
            </button>
          </>
        )
      )}

      {picker && (
        <AddPicker
          choices={addChoices}
          slotLabel={picker.slot ? formatSpan(picker.slot.start, picker.slot.end) : undefined}
          onClose={() => setPicker(null)}
          onPick={(entryId) => {
            setPicker(null);
            onAddItem(picker.versionId, entryId, picker.slot);
          }}
        />
      )}
    </div>
  );
}
