import { useState } from 'react';
import { Bed, ChevronUp } from 'lucide-react';
import { Button } from '../../design/components/core/Button';
import { Tag } from '../../design/components/core/Chip';
import type { EntrySummary } from '../../api/types';
import { AddPicker } from './AddPicker';
import { DayStateDot } from './DayStateDot';
import { formatSpan } from './itineraryModel';
import type { ItineraryDay, PoolEntry } from './itineraryModel';
import { LodgingEditor } from './LodgingEditor';
import { LodgingPill } from './LodgingPill';
import { SwapDayMenu } from './SwapDayMenu';
import type { SwapDayChoice } from './SwapDayMenu';
import { useDayDrop } from './useDayDrop';
import type { ItineraryDropHandler } from './useDayDrop';
import { VersionColumns } from './VersionColumns';
import { VersionItems } from './VersionItems';
import styles from './DayCard.module.css';
// The pill's own measurements, borrowed for the read-only twin below. Lodging
// is one shape in this header whether or not you can change it, and the shape
// is stated once — in the pill's stylesheet — rather than copied into this one.
import lodgingStyles from './LodgingPill.module.css';

/** Which version the picker is filling, and over which hours if it came from a gap. */
interface PickerTarget {
  versionId: number;
  slot: { start: number; end: number } | null;
}

export interface DayCardProps {
  day: ItineraryDay;
  /** Kept places the lodging editor offers. */
  lodgingChoices?: EntrySummary[];
  /** Everything kept for this trip, placed or not — the rail's pool, for the picker. */
  addChoices?: PoolEntry[];
  /** Every day of the trip, for the swap menu. Omitted, no swap is offered. */
  swapChoices?: SwapDayChoice[];
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
  /**
   * A name typed into the picker rather than chosen from it: keep a new idea
   * and put it on this day in one go. Same `slot` rule as `onAddItem`.
   * Omitted, the picker is a shelf only and offers no way to write anything
   * down — which is what a caller with no create path wants.
   */
  onCreateItem?: (versionId: number, title: string, slot: { start: number; end: number } | null) => void;
  onEditTime: (itemId: number, startsAtMinutes: number | null, endsAtMinutes: number | null) => void;
  onRemoveItem: (itemId: number) => void;
  /** Both keys together: one clears the other, and both null clears the night. */
  onSetLodging: (value: { lodging_entry_id: number | null; lodging_label: string | null }) => void;
  /**
   * Exchange this day with another date of the trip — the two plans trade
   * places, lodging and all. Needs `swapChoices` to have anything to offer.
   */
  onSwapDay?: (otherDay: string) => void;
  /**
   * Something from the rail was dropped on this day. Must be inside a
   * `<DndContext>`. The second argument is the version it landed in: a number
   * when the day is split and the drop was aimed at one of its columns, null
   * when it landed on the day itself and the day is the one that decides.
   */
  onDropItem?: ItineraryDropHandler;
  /**
   * A viewer's day: everything on it still readable, nothing on it changeable.
   * The callbacks above still arrive — the container has no reason to withhold
   * them — and this decides which of the controls that would fire them exist.
   * Same word and same default as ItemLine, GapRow and VersionItems, which is
   * what lets it be handed straight down to them.
   */
  readOnly?: boolean;
  /**
   * The item that just landed on this day untimed, still being asked "when?".
   * The container owns it — the answer outlives any one card — and this card
   * only works out which day name the prompt should say and hands all of it
   * down to whichever branch is drawing the rows.
   */
  promptItemId?: number | null;
  onPromptDismiss?: () => void;
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
 *
 * Read-only is the same card with the ways in taken out rather than a second
 * card: the day's number, its state dot, its split tag, where you sleep and its
 * whole running order are all still here, because a viewer who cannot see what
 * the day holds has been given nothing. What goes is only what would write —
 * and it goes by not being rendered at all, because a row of disabled controls
 * reads as "you did something wrong" where an absent one reads as "this isn't
 * yours to change".
 */
export function DayCard({
  day,
  lodgingChoices = [],
  addChoices = [],
  swapChoices = [],
  isDropTarget = false,
  onToggle,
  onFork,
  onKeepVersion,
  onAddItem,
  onCreateItem,
  onEditTime,
  onRemoveItem,
  onSetLodging,
  onSwapDay,
  onDropItem,
  readOnly = false,
  promptItemId = null,
  onPromptDismiss,
}: DayCardProps) {
  const { setNodeRef, isOver, dropId } = useDayDrop(day.day, onDropItem);
  const [lodgingOpen, setLodgingOpen] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  const split = day.versions.length > 1;
  const firstVersion = day.versions[0];
  // "Day 3 · Wed 15" → "Wed 15": the prompt asks about a date, and the count is
  // already said by the card's own heading right above it. A label without the
  // house separator is taken whole rather than guessed at.
  const promptDayName = day.label.split('·')[1]?.trim() ?? day.label;

  return (
    <div
      ref={setNodeRef}
      className={styles.card}
      data-drop-id={dropId}
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

        {/* Where you sleep is a fact about the night, so a viewer keeps it —
            as a Tag, the static twin of the Chip the pill draws itself with,
            wearing the pill's own measurements. Bare text beside a hidden icon,
            exactly as the collapsed row (DayRow) already draws the same fact:
            an aria-label on a span with no role is not reliably read, and the
            title is the whole of what there is to say once it is not a control.

            The unset state has no read-only form at all. "+ where you sleep" is
            an invitation, and there is nothing here to accept it with. */}
        {readOnly ? (
          day.lodgingTitle && (
            <Tag tone="saved" className={lodgingStyles.pill}>
              <Bed size={15} strokeWidth={1.5} aria-hidden="true" className={lodgingStyles.icon} />
              <span className={lodgingStyles.title}>{day.lodgingTitle}</span>
            </Tag>
          )
        ) : (
          <LodgingPill title={day.lodgingTitle} onClick={() => setLodgingOpen((open) => !open)} />
        )}

        <span className={styles.headActions}>
          {/* One live version: forking makes a second. Already split: the same
              action adds another way to spend the day, so the verb changes but
              the endpoint does not. */}
          {!readOnly && (
            <Button size="small" variant="secondary" onClick={onFork}>
              {split ? 'Add another' : 'Fork this day'}
            </Button>
          )}

          {/* The chevron before the swap, which is the order the collapsed row
              (DayRow) puts them in and cannot change: there the chevron is a
              grid column of the toggle button, and the swap has to be outside
              that button entirely. Matching it here is what keeps either
              control from sliding out from under the pointer when the day
              opens or closes. */}
          <button
            type="button"
            className={styles.close}
            onClick={onToggle}
            aria-expanded
            aria-label={`Close ${day.label}`}
          >
            <ChevronUp size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>

          {/* Beside the day's other actions rather than in the body: swapping
              is something done TO the day, like forking it, not something done
              to what is on it. */}
          {onSwapDay && !readOnly && (
            <SwapDayMenu day={day.day} dayLabel={day.label} choices={swapChoices} onSwap={onSwapDay} />
          )}
        </span>
      </div>

      {/* Not merely unopened for a viewer but unmounted: the pill that opens it
          is the only way in and a viewer gets the inert twin, so this states
          that there is no second path rather than trusting there is none. */}
      {lodgingOpen && !readOnly && (
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
          day={day.day}
          versions={day.versions}
          dayLabel={day.label}
          onKeep={onKeepVersion}
          onEditTime={onEditTime}
          onRemoveItem={onRemoveItem}
          onAdd={(versionId) => setPicker({ versionId, slot: null })}
          onFill={(versionId, slot) => setPicker({ versionId, slot })}
          onDropItem={onDropItem}
          readOnly={readOnly}
          promptItemId={promptItemId}
          promptDayName={promptDayName}
          onPromptDismiss={onPromptDismiss}
        />
      ) : (
        firstVersion && (
          <>
            <VersionItems
              items={firstVersion.schedule_items}
              onEditTime={onEditTime}
              onRemoveItem={onRemoveItem}
              onFill={(slot) => setPicker({ versionId: firstVersion.id, slot })}
              readOnly={readOnly}
              promptItemId={promptItemId}
              promptDayName={promptDayName}
              onPromptDismiss={onPromptDismiss}
            />
            {!readOnly && (
              <button
                type="button"
                className={styles.add}
                onClick={() => setPicker({ versionId: firstVersion.id, slot: null })}
              >
                + add to this day
              </button>
            )}
          </>
        )
      )}

      {/* Unmounted for the same reason the lodging editor is: every way of
          opening it — the add line, a column's own add, a gap's "Fill it" —
          has already gone. */}
      {picker && !readOnly && (
        <AddPicker
          choices={addChoices}
          day={day.day}
          slotLabel={picker.slot ? formatSpan(picker.slot.start, picker.slot.end) : undefined}
          onClose={() => setPicker(null)}
          onPick={(entryId) => {
            setPicker(null);
            onAddItem(picker.versionId, entryId, picker.slot);
          }}
          /* Passed through only when the container gave one, so the prop stays
             the switch that decides whether the picker can keep as well as
             pick. Closes on submit exactly as picking does: the thing asked
             for is on the day, and a picker still standing over it is asking
             the question again. */
          onCreate={
            onCreateItem &&
            ((title) => {
              const target = picker;
              setPicker(null);
              onCreateItem(target.versionId, title, target.slot);
            })
          }
        />
      )}
    </div>
  );
}
