import { useCallback, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, SensorDescriptor, SensorOptions } from '@dnd-kit/core';
import { useCanEdit } from '../auth/TripRoleContext';
import { EntryRow } from '../components/EntryRow';
import { Card } from '../components/layout/Card';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useEntries, useRestoreEntry } from '../api';
import type { Entry } from '../api/types';
import { BoardMapPane } from '../features/board/BoardMapPane';
import { FilterBar } from '../features/board/FilterBar';
import { IdeaList } from '../features/board/IdeaList';
import { NewIdeaModal } from '../features/board/NewIdeaModal';
import { BulkBar } from '../features/board/BulkBar';
import { BundlePanel } from '../features/board/BundlePanel';
import { SetAsideSection } from '../features/board/SetAsideSection';
import { useBundleMembers } from '../features/board/useBundleMembers';
import { useLinkMutations } from '../features/board/useLinkMutations';
import type { BundleDropData } from '../features/board/bundleDrop';
import { EMPTY_FILTERS, applyFilters, groupEntries } from '../features/board/filters';
import type { GroupMode, IdeaFilters } from '../features/board/filters';
import { isWithinBounds } from '../features/map/bounds';
import { entriesWithCoordinates, entryToPin } from '../features/map/pins';
import type { Bounds, MapPin, PinTone } from '../features/map/types';
import { EntryDetailDrawer } from './EntryDetail';
import styles from './TripBoard.module.css';

/**
 * No sensors at all is the read-only kill switch for drag and drop. Styling a
 * row as inert does not stop dnd-kit, and disabling each draggable would still
 * leave the keyboard sensor listening; taking the sensors away closes both
 * doors at the DndContext, above every draggable and droppable on the board.
 * Module-level so the identity is stable and DndContext does not re-register on
 * every render.
 */
const NO_SENSORS: SensorDescriptor<SensorOptions>[] = [];

/**
 * /trips/:id — the planning board. Two columns: the ideas the trip is made of,
 * and the bundle rail that groups them. Renders inside TripLayout, which draws
 * the trip title and dates; the trip's own tabs live in the app sidebar, not
 * here.
 *
 * The entry tree that used to occupy a third column is gone. Ideas and bundles
 * are genuinely many-to-many in the data model — an idea can sit in several
 * bundles at once — but showing that hierarchy as navigation was descoped, so
 * the board no longer scopes itself to a sub-entry. EntryTree.tsx is left on
 * disk deliberately: this is "not for now", not "never".
 *
 * Filtering and grouping are separate axes and must stay that way. The category
 * chips narrow WHICH ideas show; the group mode only changes how the survivors
 * are arranged. Grouping by location while filtered to Food is a supported
 * combination, not an accident.
 *
 * The map is a THIRD axis, and it composes with the other two rather than
 * replacing either. One pipeline, in one order, and everything on the screen
 * reads off it:
 *
 *   allIdeas -> applyFilters -> visibleIdeas -> the map's viewport -> spatiallyVisible
 *
 * The pins are drawn from `visibleIdeas`, so a chip takes ideas off the map as
 * well as out of the list — the two halves are always looking at the same set.
 * The viewport cut is applied only to the LIST, and only while the reader has
 * asked for it (`narrowing`), because a map that hid its own pins as you panned
 * would erase the thing you were panning towards.
 *
 * Ideas with no coordinates are never cut by the viewport. They cannot be
 * anywhere, so they cannot be somewhere else — dropping them would mean a trip's
 * unplaced ideas silently vanished the moment the map came up, which is the one
 * outcome this screen must not produce.
 */
export function TripBoard() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const { show } = useToast();
  // The hook rather than the outlet context: the same answer reaches the rail,
  // the rows and the bulk bar below without being threaded through four
  // components, and outside a trip it defaults to editable. TripLayout mounts
  // the provider.
  const canEdit = useCanEdit();

  const [filters, setFilters] = useState<IdeaFilters>(EMPTY_FILTERS);
  // Ungrouped is the honest starting point, and what the design shows: the
  // board opens as the whole list, and sectioning it is something you ask for.
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newIdeaOpen, setNewIdeaOpen] = useState(false);
  // The idea whose edit drawer is up, if any. Held here rather than reached by
  // navigating to /entries/:id, so the drawer lands over the board instead of
  // over an empty page — see EntryDetailDrawer.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ entryId: number; title: string } | null>(null);
  const lastSelectedId = useRef<number | null>(null);

  // The map starts open: where a trip's ideas ARE is half of what the board has
  // to say about them, and a map behind a button is one nobody presses. Hiding
  // it is a single click and the list comes back whole, so the reader who wants
  // the list alone loses less by dismissing it than the reader who wants the map
  // loses by never discovering it.
  const [mapOpen, setMapOpen] = useState(true);
  // ...but once it IS open, it starts bound to the list, because a map that
  // narrows nothing looks broken until you find the switch that explains it.
  const [followMap, setFollowMap] = useState(true);
  const [mapBounds, setMapBounds] = useState<Bounds | null>(null);
  // A nonce, not a boolean: "widen" is something that HAPPENED, and the same
  // thing can happen twice. See MapView's `fitRequest`.
  const [fitRequest, setFitRequest] = useState(0);
  // Picking several ideas is a mode now, not a permanent column of checkboxes.
  const [selectMode, setSelectMode] = useState(false);
  // The pin the reader last pointed at, held here only to draw it as "this one".
  const [pinnedId, setPinnedId] = useState<number | null>(null);

  const restoreEntry = useRestoreEntry();
  const { addLink } = useLinkMutations();

  // Stable handle, not an inline arrow: NewIdeaModal memoizes its own internal
  // onClose forward to keep Modal's focus effect (which depends on [open,
  // onClose]) from re-firing and stealing focus back from a field mid-word
  // every time this component happens to re-render — see NewIdeaModal.tsx's
  // doc comment for the underlying Modal.tsx bug.
  const closeNewIdea = useCallback(() => setNewIdeaOpen(false), []);
  const openNewIdea = useCallback(() => setNewIdeaOpen(true), []);

  const ideasQuery = useEntries({ trip_id: trip.id, kind: 'idea', include_archived: true });
  const bundlesQuery = useEntries({ trip_id: trip.id, kind: 'bundle', include_archived: true });

  const allIdeas = useMemo(() => (ideasQuery.data ?? []).filter((e) => !e.archived_at), [ideasQuery.data]);
  const archivedIdeas = useMemo(() => (ideasQuery.data ?? []).filter((e) => e.archived_at), [ideasQuery.data]);
  const bundles = useMemo(() => (bundlesQuery.data ?? []).filter((e) => !e.archived_at), [bundlesQuery.data]);
  const archivedBundles = useMemo(() => (bundlesQuery.data ?? []).filter((e) => e.archived_at), [bundlesQuery.data]);

  const members = useBundleMembers(bundles);

  const visibleIdeas = useMemo(() => applyFilters(allIdeas, filters), [allIdeas, filters]);

  // All three have to be true before the viewport touches the list: no map, no
  // cut; follow switched off, no cut; and no bounds reported yet, nothing to cut
  // against. The last one matters on the very first frame after the map opens.
  const narrowing = mapOpen && followMap && mapBounds !== null;

  const spatiallyVisible = useMemo(() => {
    if (!narrowing || !mapBounds) return visibleIdeas;
    return visibleIdeas.filter(
      (entry) =>
        entry.lat === null ||
        entry.lng === null ||
        isWithinBounds({ id: entry.id, lat: entry.lat, lng: entry.lng }, mapBounds),
    );
  }, [visibleIdeas, narrowing, mapBounds]);

  // What the MAP thinks is off-screen, which is not the same question as what
  // the LIST is currently hiding. This one ignores the follow switch on purpose:
  // it is what the pill on the map reports and what decides whether "Widen" is
  // worth offering, and both of those are true whether or not the list is
  // listening. `offCount` below is the list's version, and is zero unless the
  // list is actually being cut.
  const offViewCount = useMemo(() => {
    if (!mapOpen || !mapBounds) return 0;
    return visibleIdeas.filter(
      (entry) =>
        entry.lat !== null &&
        entry.lng !== null &&
        !isWithinBounds({ id: entry.id, lat: entry.lat, lng: entry.lng }, mapBounds),
    ).length;
  }, [visibleIdeas, mapOpen, mapBounds]);

  const offCount = visibleIdeas.length - spatiallyVisible.length;

  // Every idea that is already in a bundle, flattened once rather than searched
  // per pin — otherwise toning N pins costs N × bundles lookups on every pan.
  const bundledIds = useMemo(
    () => new Set([...members.values()].flatMap((list) => list.map((entry) => entry.id))),
    [members],
  );

  // Pins come off the FILTERED list, never the viewport-cut one: panning must
  // not delete the pins you are panning towards. Tone is decided here because
  // this is the only place that holds both the viewport and the bundle
  // membership — see MapPin.tone. Bundled beats in-view beats off-view: "this
  // one is already spoken for" is the more useful thing to know about a place
  // than "it is on screen", which the reader can see for themselves.
  //
  // "Off view" is measured against `narrowing`, not against the bounds alone,
  // because the tone means "not in the list you can see" — and with the follow
  // switch off, everything IS in that list however far the map has been dragged.
  const pins = useMemo<MapPin[]>(
    () =>
      entriesWithCoordinates(visibleIdeas).map((entry) => {
        const located = entry as Entry & { lat: number; lng: number };
        const tone: PinTone = bundledIds.has(entry.id)
          ? 'bundled'
          : narrowing && mapBounds && !isWithinBounds({ id: entry.id, lat: located.lat, lng: located.lng }, mapBounds)
            ? 'offView'
            : 'inView';
        return { ...entryToPin(located), tone };
      }),
    [visibleIdeas, bundledIds, narrowing, mapBounds],
  );

  // Shift-select ranges follow the order the list actually renders in, so the
  // range a user sees between two clicks is the range they get — which means
  // reading it off the SPATIALLY visible list, not the filtered one. Otherwise
  // a shift-range across two rows on screen would quietly pick up everything the
  // map had cut from between them.
  const orderedVisibleIds = useMemo(
    () => groupEntries(spatiallyVisible, groupMode).flatMap((group) => group.entries.map((e) => e.id)),
    [spatiallyVisible, groupMode],
  );

  // Both sensors are always built — hooks cannot be called conditionally — and
  // then either handed to DndContext or dropped on the floor. See NO_SENSORS.
  const editSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const sensors = canEdit ? editSensors : NO_SENSORS;

  function onToggleSelect(id: number, shiftKey: boolean) {
    setSelectedIds((prev) => {
      if (shiftKey && lastSelectedId.current !== null) {
        const startIndex = orderedVisibleIds.indexOf(lastSelectedId.current);
        const endIndex = orderedVisibleIds.indexOf(id);
        if (startIndex !== -1 && endIndex !== -1) {
          const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          const range = orderedVisibleIds.slice(from, to + 1);
          return Array.from(new Set([...prev, ...range]));
        }
      }
      lastSelectedId.current = id;
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }

  /**
   * Closing the map forgets where it was looking, in both senses: the list stops
   * being cut (there is no viewport any more, so `mapBounds` would be a stale
   * fact about a map nobody can see), and the map itself unmounts rather than
   * being hidden. Unmounting is not an optimisation — Leaflet caches its
   * container size and paints grey where it thinks there is no map, so one
   * revealed at zero height comes back as a grid of blank tiles. It also buys
   * "showing the map again starts fresh" for free, which is the behaviour a
   * reader expects from a pane they just dismissed.
   */
  function toggleMap() {
    const next = !mapOpen;
    setMapOpen(next);
    if (!next) setMapBounds(null);
  }

  /** Leaving select mode drops the picks with it — an invisible selection is a trap. */
  function setSelecting(selecting: boolean) {
    setSelectMode(selecting);
    if (!selecting) setSelectedIds([]);
  }

  /**
   * A pin click surfaces its idea. In select mode that means ticking its row —
   * the design's "clicking a pin ticks its row", and the reason you can build a
   * bundle from either side of the screen. Out of select mode there is nothing
   * to tick, so it just marks the pin as the one you mean, the same way hovering
   * a row does on /library.
   */
  function handleSelectPin(id: number) {
    setPinnedId(id);
    if (selectMode) onToggleSelect(id, false);
  }

  /**
   * Opening a cluster reads as "these ones" — so it picks them, and turns select
   * mode ON to do it. Picking without the mode would leave the rows looking
   * exactly as they did while a bulk bar appeared underneath them, which is a
   * selection you cannot see and therefore cannot correct.
   */
  function handleSelectCluster(ids: number[]) {
    setSelectMode(true);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    show(ids.length === 1 ? 'Selected 1 idea near here.' : `Selected ${ids.length} ideas near here.`, 'success');
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { entryId: number; title: string } | undefined;
    if (data) setActiveDrag(data);
  }

  /**
   * There is one kind of drop target left: a bundle that already exists. It is
   * recognised by its droppable data rather than by parsing its id — see
   * bundleDrop.ts, which also records what the second kind used to be and why
   * the dashed "start a bundle" target is gone.
   *
   * Dropping onto a bundle COPIES the link and never removes the old one, so an
   * idea can belong to several bundles at once. Nothing here creates anything:
   * a bundle is made by naming it, in the rail's own header.
   */
  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const entryData = active.data.current as { entryId: number; title: string } | undefined;
    const overData = over.data.current as BundleDropData | undefined;
    if (!entryData || !overData) return;

    if (overData.bundleId === undefined) return;
    const bundleTitle = overData.title ?? 'the bundle';
    addLink.mutate(
      { parentId: overData.bundleId, childId: entryData.entryId },
      {
        onSuccess: () => show(`Added ${entryData.title} to ${bundleTitle}.`, 'success'),
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDrag(null)}>
      <div className={styles.grid}>
        <section className={styles.ideas} aria-label="Ideas">
          {/* FilterBar already takes the way in away, so this can never open for
              a viewer — it is not mounted either, so there is no second path to
              it and nothing listening for an Escape that will never come. */}
          {canEdit && <NewIdeaModal open={newIdeaOpen} onClose={closeNewIdea} parentId={trip.id} />}

          <FilterBar
            filters={filters}
            onChange={setFilters}
            groupMode={groupMode}
            onGroupModeChange={setGroupMode}
            onNewIdea={openNewIdea}
            visibleCount={spatiallyVisible.length}
            totalCount={allIdeas.length}
            mapOpen={mapOpen}
            onToggleMap={toggleMap}
            followMap={followMap}
            onFollowMapChange={setFollowMap}
            selectMode={selectMode}
            onSelectModeChange={setSelecting}
            mapNarrowing={narrowing}
            mapOffCount={offCount}
          />

          {/* Map and list share one wrapping row: the map is on the left, where
              the design puts it, and the list keeps the wider basis because it
              is the thing being read. Nothing here is a breakpoint — see the
              stylesheet.

              data-map is the one thing the stylesheet cannot work out for
              itself: the list's reading-measure cap only makes sense while
              there is a map to hand the surplus width to, and CSS has no way
              to ask whether a sibling exists. Present or absent rather than
              open/closed, so the closed case needs no selector at all. */}
          <div className={styles.body} data-map={mapOpen ? 'open' : undefined}>
            {/* Rendered only while open, never merely hidden. See toggleMap. */}
            {mapOpen && (
              <div className={styles.mapCell}>
                <BoardMapPane
                  pins={pins}
                  selectedId={pinnedId}
                  onSelectPin={handleSelectPin}
                  onSelectCluster={handleSelectCluster}
                  onBoundsChange={setMapBounds}
                  fitRequest={fitRequest}
                  following={followMap}
                  offCount={offViewCount}
                  onWiden={() => setFitRequest((n) => n + 1)}
                />
              </div>
            )}

            <div className={styles.listCell}>
              <BulkBar
                selectedIds={selectedIds}
                bundles={bundles}
                members={members}
                tripId={trip.id}
                onClear={() => setSelectedIds([])}
                onExitSelectMode={() => setSelecting(false)}
                onToast={(message) => show(message, 'success')}
              />

              {ideasQuery.isLoading ? (
                <Spinner label="Finding your ideas" />
              ) : allIdeas.length === 0 ? (
                <EmptyState message="This one's still a daydream. Add the first thing you'd like to do." />
              ) : spatiallyVisible.length === 0 ? (
                // Missing from the design, and the state a map makes easy to
                // reach: pan somewhere empty and the list is legitimately
                // nothing. An empty column with a count line above it reads as a
                // failure to load, so the list says which narrowing did it and
                // where the way back is.
                <p className={styles.noneInView}>
                  {narrowing
                    ? 'Nothing kept is in this part of the map. Pan somewhere else, or widen the view.'
                    : 'Nothing matches those filters. Nothing is gone — widen them and it comes back.'}
                </p>
              ) : (
                <IdeaList
                  entries={spatiallyVisible}
                  groupMode={groupMode}
                  bundles={bundles}
                  members={members}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                  onEdit={setEditingId}
                  onToast={(message) => show(message, 'success')}
                  canEdit={canEdit}
                />
              )}

              <SetAsideSection
                entries={archivedIdeas}
                onRestore={(id) => restoreEntry.mutate(id, { onSuccess: () => show('Picked back up.', 'success') })}
                canEdit={canEdit}
              />
            </div>
          </div>
        </section>

        <BundlePanel
          tripId={trip.id}
          bundles={bundles}
          archivedBundles={archivedBundles}
          members={members}
          loading={bundlesQuery.isLoading}
          onToast={(message) => show(message, 'success')}
        />
      </div>

      {editingId !== null && (
        <EntryDetailDrawer entryId={editingId} onClose={() => setEditingId(null)} />
      )}

      <DragOverlay>
        {activeDrag && <Card padding={2}><EntryRow title={activeDrag.title} kept={false} /></Card>}
      </DragOverlay>
    </DndContext>
  );
}
