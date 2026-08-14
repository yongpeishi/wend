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
import type { DragStartEvent } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../design/components/core/Button';
import { EntryRow } from '../components/EntryRow';
import { Card } from '../components/layout/Card';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { api } from '../api/client';
import { useEntries, useUpdateEntry } from '../api/entries';
import { queryKeys } from '../api/queryKeys';
import { useCreateScheduleItem, useDeleteScheduleItem } from '../api/schedule';
import {
  useForkDay,
  useItinerary,
  useKeepVersion,
  useRestoreVersion,
  useUpdateTripDay,
} from '../api/itinerary';
import type { Entry, EntrySummary, ScheduleItem } from '../api/types';
import {
  ArchivedPanel,
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
import { formatTripLength } from '../lib/formatDates';
import styles from './TripItinerary.module.css';

/** What a failed write says. Nothing is lost — the screen still holds it. */
const SAVE_FAILED = "That didn't save. It's still here — try again.";

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
 */
export function TripItinerary() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const navigate = useNavigate();
  const { show } = useToast();

  const itineraryQuery = useItinerary(trip.id);
  const ideasQuery = useEntries({ trip_id: trip.id, kind: 'idea' });
  const bundlesQuery = useEntries({ trip_id: trip.id, kind: 'bundle' });

  // Several days open at once is the design's rule: the page just gets longer.
  const [openDays, setOpenDays] = useState<string[]>([]);
  // The gate is forced open by "Change dates" over a trip that already has them.
  const [datesOpen, setDatesOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [dragging, setDragging] = useState<ItineraryDragData | null>(null);

  const updateTrip = useUpdateEntry(trip.id);
  const updateTripDay = useUpdateTripDay(trip.id);
  const forkDay = useForkDay(trip.id);
  const keepVersion = useKeepVersion(trip.id);
  const restoreVersion = useRestoreVersion(trip.id);
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

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
  ) {
    const version = day.versions.find((v) => v.id === versionId) ?? day.versions[0];
    const items = version?.schedule_items ?? [];
    const entry = kept.find((choice) => choice.id === entryId);
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

  /** The rail's ⋯ menu and its drop targets both land here. */
  function placeOnDay(entryId: number, dayIso: string) {
    const day = days.find((d) => d.day === dayIso);
    if (!day) return;
    const version = day.versions[0];
    if (!version) return;
    placeEntry(day, version.id, entryId, null);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as ItineraryDragData | undefined;
    if (data) setDragging(data);
  }

  // The drop itself is handled by useDayDrop's own monitor inside each day, so
  // there is nothing to do at the end of a drag but put the overlay away.
  const endDrag = () => setDragging(null);

  if (datesOpen || !trip.starts_on || !trip.ends_on) {
    return (
      <DatesGate
        tripTitle={trip.title}
        keptCount={kept.length}
        saving={updateTrip.isPending}
        initialStart={trip.starts_on}
        initialEnd={trip.ends_on}
        // Reopened over a dated trip, "back" is the day list you came from;
        // reached because the trip has no dates at all, it is the ideas board,
        // which is where the material for a day comes from.
        onBack={() => (datesOpen ? setDatesOpen(false) : navigate(`/trips/${trip.id}`))}
        onConfirm={(startsOn, endsOn) =>
          updateTrip.mutate(
            { entry: { starts_on: startsOn, ends_on: endsOn } },
            {
              onSuccess: () => {
                setDatesOpen(false);
                show('Your days are open.', 'success');
              },
              onError,
            },
          )
        }
      />
    );
  }

  if (itineraryQuery.isLoading) {
    return <Spinner label="Finding your days" />;
  }

  if (itineraryQuery.isError) {
    return (
      <EmptyState
        message="Your days didn't load. Nothing is lost — everything you've placed is still on them."
        action={
          <Button variant="secondary" onClick={() => void itineraryQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={endDrag} onDragCancel={endDrag}>
      <div className={styles.screen}>
        <div className={styles.main}>
          <ItineraryHeader
            meta={meta}
            splitLine={splitLine}
            onExpandAll={() => setOpenDays(days.map((day) => day.day))}
            onCollapseAll={() => setOpenDays([])}
            onChangeDates={() => setDatesOpen(true)}
          />

          <div className={styles.list}>
            {days.map((day) =>
              openDays.includes(day.day) ? (
                <DayCard
                  key={day.day}
                  day={day}
                  lodgingChoices={lodgingChoices}
                  addChoices={unplaced}
                  onToggle={() => toggleDay(day.day)}
                  onDropItem={(entryId) => placeOnDay(entryId, day.day)}
                  onAddItem={(versionId, entryId, slot) => placeEntry(day, versionId, entryId, slot)}
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
                />
              ) : (
                <DayRow
                  key={day.day}
                  day={day}
                  onToggle={() => toggleDay(day.day)}
                  onDropItem={(entryId) => placeOnDay(entryId, day.day)}
                />
              ),
            )}
          </div>
        </div>

        <UnplacedRail
          title={`Not placed yet · ${unplaced.length}`}
          line="Drag one onto a day, or use its ⋯ menu to pick the day."
          items={unplaced}
          days={days}
          onAddToDay={placeOnDay}
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
          />
        </UnplacedRail>
      </div>

      <DragOverlay>
        {dragging && (
          <Card padding={2}>
            <EntryRow title={dragging.title} kept />
          </Card>
        )}
      </DragOverlay>
    </DndContext>
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
    location_name: entry.location_name,
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
