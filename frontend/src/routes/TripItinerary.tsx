import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  Active,
  Announcements,
  DragStartEvent,
  Over,
  ScreenReaderInstructions,
  SensorDescriptor,
  SensorOptions,
} from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCanEdit } from '../auth/TripRoleContext';
import { EntryRow } from '../components/EntryRow';
import { Card } from '../components/layout/Card';
import { QueryGate } from '../components/QueryGate';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import { useChangeTripDates, useCreateEntry, useEntries } from '../api/entries';
import { queryKeys } from '../api/queryKeys';
import { useCreateScheduleItem, useDeleteScheduleItem } from '../api/schedule';
import {
  useForkDay,
  useItinerary,
  useKeepVersion,
  useRestoreVersion,
  useSwapDays,
  useUpdateTripDay,
} from '../api/itinerary';
import type { Entry, EntrySummary, ScheduleItem } from '../api/types';
import {
  ArchivedPanel,
  DateShiftWarningModal,
  DatesGate,
  DayCard,
  DayRow,
  ItineraryHeader,
  UnplacedRail,
  UNSAVED_VERSION_ID,
  buildDayList,
  nextFreeSlot,
} from '../features/itinerary';
import type { ArchivedVersion, ItineraryDay, ItineraryDragData } from '../features/itinerary';
// Not through the barrel: these are the drag machinery the DndContext itself
// is wired with, rather than parts the screen draws.
import { dayDroppableId, itineraryDragStrategy, versionDroppableId } from '../features/itinerary/useDayDrop';
import { formatTripLength } from '../lib/formatDates';
import styles from './TripItinerary.module.css';

/** What a failed write says. Nothing is lost — the screen still holds it. */
const SAVE_FAILED = "That didn't save. It's still here — try again.";

/**
 * No sensors at all is the read-only kill switch for drag and drop, the same
 * one TripBoard.tsx uses on the sibling screen. Nothing softer works: a row
 * styled inert is still a draggable as far as dnd-kit is concerned, and taking
 * the grips away one by one would still leave the keyboard sensor listening for
 * a space bar on anything that had kept its listeners. Removing the sensors
 * closes both doors at the DndContext, above every draggable and every drop
 * target on the screen.
 *
 * Declared here rather than imported from TripBoard: two screens agreeing on a
 * technique is not a reason to couple two routes through a shared empty array.
 * Module-level so the identity is stable and DndContext does not re-register
 * its sensors on every render.
 */
const NO_SENSORS: SensorDescriptor<SensorOptions>[] = [];

/** The rail's sentence, which depends on whether the reader has the two ways in. */
const RAIL_LINE = {
  edit: 'Drag one onto a day, or use its ⋯ menu to pick the day.',
  read: 'Kept for this trip, not on a day yet.',
};

/** Dates the server refused, held until the warning modal is answered. */
interface PendingDates {
  startsOn: string;
  endsOn: string;
  droppedDays: string[];
  droppedItemCount: number;
}

/**
 * What a screen reader is told about the grip before anything moves. Says the
 * whole gesture, including the part that is easy to miss: on a split day the
 * arrow keys stop on each version separately, so Version B is somewhere you
 * can land rather than somewhere only a mouse can reach.
 */
const DRAG_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'Press space to lift this, then the arrow keys to move it between the days. A split day offers each of its versions as its own stop. Press space again to leave it there, or escape to put it back.',
};

/**
 * /trips/:id/itinerary — the second planning phase: the ideas and bundles you
 * have kept, laid onto the trip's days. Not the same screen as
 * /trips/:id/schedule, which is the finished plan read on the road.
 *
 * Everything drawn here comes from src/features/itinerary, which is
 * presentational to the last component: this container does the fetching, owns
 * every mutation, and holds the two pieces of state that are properties of the
 * screen rather than of the data — which days are open, and whether the
 * archived reveal is showing.
 *
 * Two things a reader should know before changing this file:
 *
 * - The day list is the trip's dates crossed with the days the server has rows
 *   for, so a date nothing has been placed on is still a day (buildDayList).
 *   With no dates there is no list at all, and the screen becomes the gate.
 * - Nothing on the rail is consumed. "Unplaced" means "in no live version of
 *   any day" — a fact about the days, recomputed from them every render, never
 *   a stock level that placing something decrements.
 *
 * A viewer sees this whole screen and can change none of it. The role is asked
 * once, here, and travels down as `readOnly` — the word ItemLine, GapRow and
 * VersionItems already use — so no part below ever asks the question for
 * itself. What a viewer loses is exactly the controls that write: the forks,
 * the keeps, the adds and fills, the removes, the swaps, the lodging editor,
 * the rail's grips and menus, the archived panel's way back, and "Change
 * dates". What a viewer keeps is every day, every version, every placed thing
 * and its hours, where they are sleeping, what is waiting on the rail and what
 * was set aside — reading the plan is the point of being on the trip at all.
 */
export function TripItinerary() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const navigate = useNavigate();
  const { show } = useToast();
  // Asked once and only here. Everything below takes it as a prop, so no
  // presentational part of this screen has to know a trip role exists.
  const canEdit = useCanEdit();
  const readOnly = !canEdit;

  const itineraryQuery = useItinerary(trip.id);
  const ideasQuery = useEntries({ trip_id: trip.id, kind: 'idea' });
  const bundlesQuery = useEntries({ trip_id: trip.id, kind: 'bundle' });

  // Several days open at once is the design's rule: the page just gets longer.
  const [openDays, setOpenDays] = useState<string[]>([]);
  // The gate is forced open by "Change dates" over a trip that already has them.
  const [datesOpen, setDatesOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [dragging, setDragging] = useState<ItineraryDragData | null>(null);
  /**
   * The dates the server refused, and what it said refusing them. Set from the
   * 422, cleared by either answer. Holding the dates here is what lets
   * "confirm" re-send exactly what was typed — the attempt is the preview, so
   * there is nothing else to re-read it from.
   */
  const [pendingDates, setPendingDates] = useState<PendingDates | null>(null);

  const changeDates = useChangeTripDates(trip.id);
  // The picker's name box keeps an idea before placing it — see createAndPlace.
  const createEntry = useCreateEntry();
  const updateTripDay = useUpdateTripDay(trip.id);
  const forkDay = useForkDay(trip.id);
  const keepVersion = useKeepVersion(trip.id);
  const restoreVersion = useRestoreVersion(trip.id);
  const swapDays = useSwapDays(trip.id);
  const createItem = useCreateScheduleItem(trip.id);
  const deleteItem = useDeleteScheduleItem();
  const editItemHours = useEditItemHours();

  const onError = useCallback(() => show(SAVE_FAILED, 'error'), [show]);

  const tripDays = useMemo(() => itineraryQuery.data ?? [], [itineraryQuery.data]);
  const days = useMemo(() => buildDayList(trip, tripDays), [trip, tripDays]);

  // Bundles first: they are the bigger building block, and the point of this
  // screen is laying them onto days. Both kinds drag and place identically.
  const kept = useMemo(
    () => [...(bundlesQuery.data ?? []), ...(ideasQuery.data ?? [])].map(toSummary),
    [bundlesQuery.data, ideasQuery.data],
  );

  /**
   * Every entry sitting in a live version of any day. Read from the fetched
   * rows rather than from `days` so a day outside the trip's current dates —
   * which happens the moment someone shortens a trip — still counts as placed.
   * An archived version is not live, so something only in one comes back here.
   */
  const placedEntryIds = useMemo(
    () =>
      new Set(
        tripDays
          .flatMap((tripDay) => tripDay.versions)
          .flatMap((version) => version.schedule_items)
          .map((item) => item.entry_id)
          .filter((id): id is number => id !== null),
      ),
    [tripDays],
  );

  const unplaced = useMemo(() => kept.filter((entry) => !placedEntryIds.has(entry.id)), [kept, placedEntryIds]);
  const lodgingChoices = useMemo(() => kept.filter((entry) => entry.category === 'lodging'), [kept]);
  // Every day, labelled as the screen labels it. Each day's own menu drops
  // itself out — nothing swaps with itself.
  const swapChoices = useMemo(() => days.map((day) => ({ day: day.day, label: day.label })), [days]);

  // Trip-wide, so every row has to say which day it came from — the panel sits
  // in the rail, nowhere near the day it belongs to.
  const archived: ArchivedVersion[] = useMemo(
    () =>
      days.flatMap((day) =>
        day.archivedVersions.map((version) => ({ version, label: `${day.label} · ${version.name}` })),
      ),
    [days],
  );

  /** Which date a version belongs to, so restoring one can open its day. */
  const dayOfVersion = useMemo(() => {
    const lookup = new Map<number, string>();
    for (const day of days) {
      for (const version of [...day.versions, ...day.archivedVersions]) lookup.set(version.id, day.day);
    }
    return lookup;
  }, [days]);

  const splitCount = days.filter((day) => day.versions.length > 1).length;
  // The length only. TripLayout, the shell every trip screen sits in, already
  // prints the trip's date range under its title — saying it again here is the
  // same fact twice on one page.
  const meta = formatTripLength(trip.starts_on, trip.ends_on) ?? '';
  // Said once, and only when true. No warning colour, no "finish this".
  const splitLine = splitCount > 0 ? `${splitCount} ${splitCount === 1 ? 'day' : 'days'} split · not settled` : null;

  // How a drag is aimed: what the arrow keys do, and what the drag is over.
  // One object because those two have to agree — see itineraryDragStrategy.
  const drag = useMemo(() => itineraryDragStrategy(), []);

  // Built whatever the role — hooks cannot be called conditionally — and then
  // either handed to the DndContext or dropped on the floor. See NO_SENSORS.
  const editSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // The keyboard walks the drop targets one press per target rather than
    // nudging the drag in pixels — see itineraryDragStrategy. It is the only
    // route that can reach the second column of a split day without a steady
    // hand, and the only one an automated check can drive at all.
    //
    // `auto` rather than @dnd-kit's smoothly animated default: when the stop it
    // is walking to is off-screen the sensor scrolls the page instead of moving
    // the drag, and compensates for the scroll in the same breath. Animating
    // that leaves the two out of step for the length of the animation, so the
    // overlay drifts away from the target the announcement has already named.
    useSensor(KeyboardSensor, { coordinateGetter: drag.coordinateGetter, scrollBehavior: 'auto' }),
  );
  const sensors = canEdit ? editSensors : NO_SENSORS;

  /**
   * What each drop target is called out loud. Every version of a split day is
   * named, because "over Day 2" while hovering one of two columns is the one
   * thing a screen reader must not say here.
   */
  const dropTargetNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const day of days) {
      names.set(dayDroppableId(day.day), day.label);
      if (day.versions.length < 2) continue;
      for (const version of day.versions) {
        names.set(versionDroppableId(day.day, version.id), `${version.name} of ${day.label}`);
      }
    }
    return names;
  }, [days]);

  const announcements: Announcements = useMemo(() => {
    const what = (active: Active) => (active.data.current as ItineraryDragData | undefined)?.title ?? 'It';
    const where = (over: Over | null) => (over ? (dropTargetNames.get(String(over.id)) ?? null) : null);

    return {
      onDragStart: ({ active }) => `Lifted ${what(active)}.`,
      onDragOver: ({ active, over }) => {
        const target = where(over);
        return target ? `${what(active)} is over ${target}.` : `${what(active)} is over no day.`;
      },
      onDragEnd: ({ active, over }) => {
        const target = where(over);
        return target
          ? `${what(active)} was left on ${target}.`
          : `${what(active)} was let go where no day takes it. Nothing changed.`;
      },
      onDragCancel: ({ active }) => `${what(active)} was put back. Nothing changed.`,
    };
  }, [dropTargetNames]);

  const openDay = useCallback((day: string) => {
    setOpenDays((prev) => (prev.includes(day) ? prev : [...prev, day]));
  }, []);

  function toggleDay(day: string) {
    setOpenDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  /**
   * Put a kept thing on a day.
   *
   * `versionId` is UNSAVED_VERSION_ID when the date has no server row yet: the
   * version is one this screen invented to have something to draw, so the POST
   * leaves `day_version_id` out and lets the API create the trip day and its
   * "Version A" (contract §2). Sending the placeholder id would 422.
   *
   * The slot is the gap's own span when the request came from "Fill it", and
   * otherwise the next free hour after everything already on that version.
   */
  function placeEntry(
    day: ItineraryDay,
    versionId: number,
    entryId: number,
    slot: { start: number; end: number } | null,
    /**
     * The entry itself, for the one caller whose entry is too new to be on the
     * shelf: an idea created seconds ago is not in `kept` until the entries
     * query comes back, and without this the toast would name it "Kept".
     */
    known?: Pick<EntrySummary, 'title' | 'duration_minutes'>,
  ) {
    const version = day.versions.find((v) => v.id === versionId) ?? day.versions[0];
    const items = version?.schedule_items ?? [];
    const entry = known ?? kept.find((choice) => choice.id === entryId);
    const when = slot ?? nextFreeSlot(items, entry?.duration_minutes ?? null);

    createItem.mutate(
      {
        entry_id: entryId,
        day: day.day,
        ...(versionId === UNSAVED_VERSION_ID ? {} : { day_version_id: versionId }),
        starts_at_minutes: when.start,
        ends_at_minutes: when.end,
        position: items.length,
      },
      {
        onSuccess: () => {
          // Opened on arrival: a thing dropped onto a closed row is otherwise
          // placed out of sight.
          openDay(day.day);
          show(`${entry?.title ?? 'Kept'} is on ${day.label}.`, 'success');
        },
        onError,
      },
    );
  }

  /**
   * The rail's ⋯ menu and every drop target land here.
   *
   * `versionId` is the version the drop named — a split day's columns are drop
   * targets in their own right, so "into Version B" arrives as B's id and is
   * honoured. Null is everything that cannot name one: the ⋯ menu, a collapsed
   * row, an unsplit day. Those take the day's first live version, which is the
   * only version there is to take.
   */
  function placeOnDay(entryId: number, dayIso: string, versionId: number | null = null) {
    const day = days.find((d) => d.day === dayIso);
    if (!day) return;
    const version = (versionId !== null && day.versions.find((v) => v.id === versionId)) || day.versions[0];
    if (!version) return;
    placeEntry(day, version.id, entryId, null);
  }

  /**
   * The picker's name box: write an idea down and put it on the day in one
   * gesture.
   *
   * Two writes, in order, because they are two facts — the idea exists, and
   * the idea is on Tuesday — and the second needs the first one's id. The
   * create is `mutateAsync` for exactly that reason; `placeEntry` then runs
   * the same path a pick from the shelf runs, so the hours, the toast and the
   * "open the day it landed on" are all one implementation.
   *
   * `parent_id` is the trip, so the idea lands at the board's top level like
   * anything typed into the capture bar. It is an ordinary trip idea from this
   * moment on — nothing about being born on the itinerary marks it.
   *
   * A name and nothing else is sent. Category, address and duration are all
   * legitimately unknown at the moment somebody thinks of a place, and writing
   * a guess onto the entry to fill the shape of the form would be worse than
   * leaving them unsaid: `nextFreeSlot` reads a null duration as the default
   * hour, which is the right answer for an idea nobody has timed yet.
   *
   * If the create fails there is nothing to place and the house sentence says
   * so. The picker has already closed by then — what was typed is gone, which
   * is the honest cost of one box and one key, and the sentence is the signal
   * to type it again.
   */
  async function createAndPlace(
    day: ItineraryDay,
    versionId: number,
    title: string,
    slot: { start: number; end: number } | null,
  ) {
    try {
      const entry = await createEntry.mutateAsync({
        entry: { kind: 'idea', title },
        parent_id: trip.id,
      });
      placeEntry(day, versionId, entry.id, slot, { title: entry.title, duration_minutes: null });
    } catch {
      onError();
    }
  }

  /**
   * Exchange two dates of the trip — "move Day 2 to be Day 3". A swap, not a
   * reorder: the other day's plan lands here in return, so nothing is pushed
   * along and nothing is lost. The whole day list comes back from the server,
   * because two days changed at once.
   */
  function swapWithDay(dayIso: string, otherIso: string) {
    const here = days.find((d) => d.day === dayIso);
    const there = days.find((d) => d.day === otherIso);
    swapDays.mutate(
      { a: dayIso, b: otherIso },
      {
        onSuccess: () => show(`${here?.label} and ${there?.label} have swapped.`, 'success'),
        onError,
      },
    );
  }

  /**
   * Send the trip's dates.
   *
   * There is no preview endpoint: the attempt itself is the preview. A change
   * that would push planned days off the end comes back refused, with NOTHING
   * written, and the warning modal takes over — confirming re-sends exactly
   * these dates with the flag set.
   */
  function submitDates(startsOn: string, endsOn: string, confirm = false) {
    changeDates.mutate(
      { startsOn, endsOn, confirm },
      {
        onSuccess: (result) => {
          if (result.status === 'dropped_days') {
            setPendingDates({
              startsOn,
              endsOn,
              droppedDays: result.droppedDays,
              droppedItemCount: result.droppedItemCount,
            });
            return;
          }
          setPendingDates(null);
          setDatesOpen(false);
          // The ideas off a cleared day are not gone: the rail is where they
          // land, and saying so here is cheaper than making someone find out.
          show(
            confirm ? 'Your days are open. What came off is waiting on the right.' : 'Your days are open.',
            'success',
          );
        },
        onError,
      },
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as ItineraryDragData | undefined;
    if (data) setDragging(data);
  }

  // The drop itself is handled by the monitor inside whichever target the
  // context resolved to — a day, or one column of a split day — so there is
  // nothing to do at the end of a drag but put the overlay away and forget
  // where the arrow keys had walked to.
  const endDrag = () => {
    drag.release();
    setDragging(null);
  };

  // A viewer only ever arrives here by the second half of this test: `datesOpen`
  // is set by "Change dates", which is not on a viewer's header at all. So the
  // gate a viewer sees is always the no-dates one, and it says so rather than
  // offering a form.
  if (datesOpen || !trip.starts_on || !trip.ends_on) {
    return (
      // The modal is a sibling of the gate, not a replacement for it: cancelling
      // has to land back on the dates that were typed, and those live in the
      // gate's own state. Unmounting it would throw them away.
      <>
        <DatesGate
          tripTitle={trip.title}
          keptCount={kept.length}
          saving={changeDates.isPending}
          initialStart={trip.starts_on}
          initialEnd={trip.ends_on}
          // Reopened over a dated trip, "back" is the day list you came from;
          // reached because the trip has no dates at all, it is the ideas board,
          // which is where the material for a day comes from.
          onBack={() => (datesOpen ? setDatesOpen(false) : navigate(`/trips/${trip.id}`))}
          onConfirm={(startsOn, endsOn) => submitDates(startsOn, endsOn)}
          readOnly={readOnly}
        />

        {/* Only ever reached by answering the gate's own form, so a viewer has
            no path to it — and it is not mounted either, so there is no second
            path and nothing listening for an answer that cannot come. */}
        {canEdit && (
          <DateShiftWarningModal
            open={pendingDates !== null}
            droppedDays={pendingDates?.droppedDays ?? []}
            droppedItemCount={pendingDates?.droppedItemCount ?? 0}
            saving={changeDates.isPending}
            onCancel={() => setPendingDates(null)}
            onConfirm={() => {
              if (pendingDates) submitDates(pendingDates.startsOn, pendingDates.endsOn, true);
            }}
          />
        )}
      </>
    );
  }

  return (
    <QueryGate
      query={itineraryQuery}
      loadingLabel="Finding your days"
      errorMessage="Your days didn't load. Nothing is lost — everything you've placed is still on them."
    >
      <DndContext
        sensors={sensors}
        // A keyboard drag is over the stop the arrow keys walked it to, and a
        // pointer drag is over the innermost thing under the cursor — so a split
        // day's columns are aimable instead of being swallowed by the day around
        // them, and what is announced is what receives the drop.
        collisionDetection={drag.collisionDetection}
        accessibility={{ announcements, screenReaderInstructions: DRAG_INSTRUCTIONS }}
        onDragStart={handleDragStart}
        onDragEnd={endDrag}
        onDragCancel={endDrag}
      >
        <div className={styles.screen}>
          <div className={styles.main}>
            <ItineraryHeader
              meta={meta}
              splitLine={splitLine}
              onExpandAll={() => setOpenDays(days.map((day) => day.day))}
              onCollapseAll={() => setOpenDays([])}
              onChangeDates={() => setDatesOpen(true)}
              readOnly={readOnly}
            />

            <div className={styles.list}>
              {days.map((day) =>
                openDays.includes(day.day) ? (
                  <DayCard
                    key={day.day}
                    day={day}
                    lodgingChoices={lodgingChoices}
                    addChoices={unplaced}
                    swapChoices={swapChoices}
                    onSwapDay={(otherDay) => swapWithDay(day.day, otherDay)}
                    onToggle={() => toggleDay(day.day)}
                    onDropItem={(entryId, versionId) => placeOnDay(entryId, day.day, versionId)}
                    onAddItem={(versionId, entryId, slot) => placeEntry(day, versionId, entryId, slot)}
                    onCreateItem={(versionId, title, slot) => createAndPlace(day, versionId, title, slot)}
                    onFork={() =>
                      forkDay.mutate(
                        { day: day.day },
                        {
                          onSuccess: () => show(`${day.label} has a second version now.`, 'success'),
                          onError,
                        },
                      )
                    }
                    onKeepVersion={(versionId) =>
                      keepVersion.mutate(
                        { versionId },
                        {
                          onSuccess: () => show(`${day.label} is settled. The rest is in Archived.`, 'success'),
                          onError,
                        },
                      )
                    }
                    onEditTime={(itemId, startsAtMinutes, endsAtMinutes) =>
                      editItemHours.mutate({ itemId, starts_at_minutes: startsAtMinutes, ends_at_minutes: endsAtMinutes }, { onError })
                    }
                    onRemoveItem={(itemId) =>
                      deleteItem.mutate(itemId, {
                        // Off the day, not out of the trip: it lands back on the rail.
                        onSuccess: () => show("Taken off the day. It's waiting on the right.", 'success'),
                        onError,
                      })
                    }
                    onSetLodging={(value) => updateTripDay.mutate({ day: day.day, ...value }, { onError })}
                    readOnly={readOnly}
                  />
                ) : (
                  <DayRow
                    key={day.day}
                    day={day}
                    swapChoices={swapChoices}
                    onSwapDay={(otherDay) => swapWithDay(day.day, otherDay)}
                    onToggle={() => toggleDay(day.day)}
                    onDropItem={(entryId) => placeOnDay(entryId, day.day)}
                    readOnly={readOnly}
                  />
                ),
              )}
            </div>
          </div>

          <UnplacedRail
            title={`Not placed yet · ${unplaced.length}`}
            // The editable sentence names a grip and a ⋯ menu, neither of which a
            // viewer has; theirs says what the list IS instead, which is the part
            // that was always worth knowing.
            line={canEdit ? RAIL_LINE.edit : RAIL_LINE.read}
            items={unplaced}
            days={days}
            onAddToDay={placeOnDay}
            readOnly={readOnly}
          >
            <ArchivedPanel
              archived={archived}
              open={archivedOpen}
              onToggle={() => setArchivedOpen((open) => !open)}
              onRestore={(versionId) =>
                restoreVersion.mutate(
                  { versionId },
                  {
                    onSuccess: () => {
                      const day = dayOfVersion.get(versionId);
                      if (day) openDay(day);
                      show("It's back on its day, beside the one you kept.", 'success');
                    },
                    onError,
                  },
                )
              }
              readOnly={readOnly}
            />
          </UnplacedRail>
        </div>

        <DragOverlay>
          {dragging && (
            <Card padding={2} className={styles.dragOverlayCard}>
              <EntryRow title={dragging.title} kept />
            </Card>
          )}
        </DragOverlay>
      </DndContext>
    </QueryGate>
  );
}

/** The list/board Entry narrowed to the summary the itinerary parts take. */
function toSummary(entry: Entry): EntrySummary {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    category: entry.category,
    duration_minutes: entry.duration_minutes,
  };
}

/**
 * Change one placed item's hours.
 *
 * `useUpdateScheduleItem(id)` binds the item at the hook call, which fits a
 * component drawn once per item (features/schedule/OptionsBlock) but not a
 * container that must be able to edit any item on the screen — the id is only
 * known when a time editor saves. So this states the same PATCH with the id in
 * the payload, and invalidates exactly what src/api/schedule.ts invalidates:
 * the itinerary and the final schedule read these same rows through different
 * endpoints. Worth folding back into src/api/schedule.ts as an id-in-payload
 * variant once that file is being touched again.
 */
function useEditItemHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...schedule_item }: { itemId: number } & Pick<ScheduleItem, 'starts_at_minutes' | 'ends_at_minutes'>) =>
      api
        .patch<{ schedule_item: ScheduleItem }>(`/schedule_items/${itemId}`, { schedule_item })
        .then((r) => r.schedule_item),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedule.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.itinerary.all });
    },
  });
}
