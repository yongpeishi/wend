import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Drawer } from '../components/Drawer';
import { EntryRow } from '../components/EntryRow';
import { Card } from '../components/layout/Card';
import { EmptyState } from '../components/EmptyState';
import { QueryGate } from '../components/QueryGate';
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
import { StructurePanel } from '../features/board/StructurePanel';
import { useBundleMembers } from '../features/board/useBundleMembers';
import { useLinkMutations } from '../features/board/useLinkMutations';
import type { BundleDropData } from '../features/board/bundleDrop';
import { isStructureDrag, isStructureDrop, performStructureMove } from '../features/board/structureDrop';
import { EMPTY_FILTERS, applyFilters, groupEntries } from '../features/board/filters';
import type { GroupMode, IdeaFilters } from '../features/board/filters';
import { isWithinBounds } from '../features/map/bounds';
import { entriesWithCoordinates, entryToPin } from '../features/map/pins';
import type { Bounds, MapPin, PinTone } from '../features/map/types';
import { EntryDetailModal } from './EntryDetail';
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

/** The board's own fold — the width at which the stylesheet collapses the grid
 * to one column. The structure panel switches presentation at the same line so
 * the two can never disagree about what "narrow" means here. */
const NARROW = '(max-width: 900px)';

/** `matchMedia` is missing in some test environments; without it the answer is
 * "wide", which is the layout with no overlay for anyone to be trapped in. */
function narrowQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(NARROW) : null;
}

/**
 * Whether the structure panel should be a pane or a Drawer. A CSS media query
 * cannot answer this one because the answer decides what is MOUNTED: rendering
 * both and hiding one would leave a modal dialog in the tree that nobody
 * opened. Local to this file on purpose, same as TripSchedule's copy — a
 * shared useMediaQuery invites every screen to branch markup on width.
 */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => narrowQuery()?.matches ?? false);

  useEffect(() => {
    const mql = narrowQuery();
    if (!mql) return;
    // Re-read once on mount as well as subscribing: a width that changed
    // between the initial state and this effect would otherwise stay wrong
    // until the next resize.
    setNarrow(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

/**
 * /trips/:id — the planning board. Two columns: the ideas the trip is made of,
 * and the bundle rail that groups them. Renders inside TripLayout, which draws
 * the trip title and dates; the trip's own tabs live in the app sidebar, not
 * here.
 *
 * The hierarchy itself — ideas and bundles are genuinely many-to-many, and a
 * child can hang under several parents at once — is on screen again as the
 * Structure panel: a disclosure tree of the whole subtree, toggled from the
 * FilterBar and drawn from the same graph query useBundleMembers already
 * makes, so opening it costs no request. It never scopes the board; it shows
 * the shape, and for an editor it now also EDITS the shape: its rows ride
 * this board's DndContext (drag a row onto a row to move it — see
 * handleDragEnd's routing), and each row's ⋯ menu holds the copy and
 * schedule verbs. On a narrow viewport the same tree arrives as the shared
 * Drawer instead of a third pane — the Drawer portals its DOM to the body,
 * but it renders inside this DndContext's React tree, so the rows' drag
 * registration works there the same way.
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
  // The idea whose edit dialog is up, if any. One piece of state for both ways
  // in — a row in the idea list and a member in the bundle rail — so the two
  // cannot drift into two different panels. Held here rather than reached by
  // navigating to /entries/:id, so it lands over the board instead of over an
  // empty page — see EntryDetailModal.
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
  // The structure panel starts closed, unlike the map: the map is half of what
  // the board has to say, the structure is an overview you reach for. Both can
  // be open at once — the panes share the ideas column's wrapping flex row, so
  // neither has to push the other out to exist.
  const [structureOpen, setStructureOpen] = useState(false);
  const isNarrow = useIsNarrow();
  // Picking several ideas is a mode now, not a permanent column of checkboxes.
  const [selectMode, setSelectMode] = useState(false);
  // The pin the reader last pointed at, held here only to draw it as "this one".
  const [pinnedId, setPinnedId] = useState<number | null>(null);

  const restoreEntry = useRestoreEntry();
  const { addLink, removeLink } = useLinkMutations();

  // Stable handle, not an inline arrow: NewIdeaModal memoizes its own internal
  // onClose forward to keep Modal's focus effect (which depends on [open,
  // onClose]) from re-firing and stealing focus back from a field mid-word
  // every time this component happens to re-render — see NewIdeaModal.tsx's
  // doc comment for the underlying Modal.tsx bug.
  const closeNewIdea = useCallback(() => setNewIdeaOpen(false), []);
  const openNewIdea = useCallback(() => setNewIdeaOpen(true), []);
  // Same reason, now that editing is a <Modal> too: a fresh arrow every render
  // would re-subscribe Modal's key handler on every keystroke the board causes.
  const closeEditing = useCallback(() => setEditingId(null), []);
  const toggleStructure = useCallback(() => setStructureOpen((open) => !open), []);
  // Stable for the same Modal-focus reason as closeNewIdea: Drawer's focus
  // effect depends on [open, onClose].
  const closeStructure = useCallback(() => setStructureOpen(false), []);
  // From the narrow-viewport Drawer only: opening an entry closes the drawer
  // first, so the detail dialog never stacks on another aria-modal surface.
  // The desktop pane has no such problem and stays up (plain setEditingId).
  const openEntryFromDrawer = useCallback((id: number) => {
    setStructureOpen(false);
    setEditingId(id);
  }, []);

  const ideasQuery = useEntries({ trip_id: trip.id, kind: 'idea', include_archived: true });
  const bundlesQuery = useEntries({ trip_id: trip.id, kind: 'bundle', include_archived: true });

  const allIdeas = useMemo(() => (ideasQuery.data ?? []).filter((e) => !e.archived_at), [ideasQuery.data]);
  const archivedIdeas = useMemo(() => (ideasQuery.data ?? []).filter((e) => e.archived_at), [ideasQuery.data]);
  const bundles = useMemo(() => (bundlesQuery.data ?? []).filter((e) => !e.archived_at), [bundlesQuery.data]);
  const archivedBundles = useMemo(() => (bundlesQuery.data ?? []).filter((e) => e.archived_at), [bundlesQuery.data]);

  const members = useBundleMembers(bundles, trip.id);

  const visibleIdeas = useMemo(() => applyFilters(allIdeas, filters), [allIdeas, filters]);

  // Whether the counts are facts yet — see countKnown on FilterBar and
  // BoardMapPane. One flag, because both would otherwise work it out from the
  // same query and could disagree.
  const countKnown = !ideasQuery.isPending && !ideasQuery.isError;

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
    const data = event.active.data.current;
    // Both kinds of drag share the one overlay card: whatever is in the air,
    // the reader follows it by its title.
    if (isStructureDrag(data)) {
      setActiveDrag({ entryId: data.childId, title: data.title });
      return;
    }
    const entryData = data as { entryId: number; title: string } | undefined;
    if (entryData) setActiveDrag(entryData);
  }

  /**
   * Two kinds of drag share this one DndContext now, and they are routed by
   * what the payload SAYS it is, never by guessing from ids: a structure-tree
   * drag declares `type: 'structure'` on both ends (see structureDrop.ts), and
   * everything else is the board's original idea-onto-bundle gesture.
   *
   * The two deliberately do different things. Dropping an idea onto a bundle
   * card COPIES — a new link, the old ones untouched, because an idea can
   * belong to several bundles at once. Dropping a tree row onto a tree row
   * MOVES — add under the target first, and only on success remove the grabbed
   * occurrence's old link, so a failure can only ever leave a copy, never a
   * orphan. A structure drag over a bundle card (or an idea over a tree row)
   * falls through to nothing: each gesture only lands on its own targets.
   */
  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    if (isStructureDrag(activeData)) {
      const target = over.data.current;
      if (!isStructureDrop(target)) return;
      performStructureMove({ drag: activeData, drop: target, addLink, removeLink, show });
      return;
    }

    const entryData = activeData as { entryId: number; title: string } | undefined;
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
            structureOpen={structureOpen}
            onToggleStructure={toggleStructure}
            mapNarrowing={narrowing}
            mapOffCount={offCount}
            countKnown={countKnown}
          />

          {/* Map and list share one wrapping row: the map is on the left, where
              the design puts it, and the list keeps the wider basis because it
              is the thing being read. Nothing here is a breakpoint — see the
              stylesheet.

              data-map is the one thing the stylesheet cannot work out for
              itself: the list's reading-measure cap only makes sense while
              there is a map to hand the surplus width to, and CSS has no way
              to ask whether a sibling exists. Present or absent rather than
              open/closed, so the closed case needs no selector at all.

              data-structure is the same fact about the third cell, and it
              tracks whether the PANE is mounted rather than whether the panel
              is open: on a narrow viewport the tree is a Drawer over the board
              and this row still holds two cells. The stylesheet rearranges the
              row around it — see [data-structure='open'] there. */}
          <div
            className={styles.body}
            data-map={mapOpen ? 'open' : undefined}
            data-structure={structureOpen && !isNarrow ? 'open' : undefined}
          >
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
                  countKnown={countKnown}
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

              <QueryGate
                query={ideasQuery}
                loadingLabel="Finding your ideas"
                errorMessage="Your ideas didn't load. Nothing is lost — everything on the board is still there."
              >
                {allIdeas.length === 0 ? (
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
              </QueryGate>

              <SetAsideSection
                entries={archivedIdeas}
                onRestore={(id) => restoreEntry.mutate(id, { onSuccess: () => show('Picked back up.', 'success') })}
                canEdit={canEdit}
              />
            </div>

            {/* The structure pane, mirroring the map's residence in this row:
                a sibling cell that wraps under the others when the column runs
                out of width. Wide viewports only — narrow ones get the Drawer
                below instead, never both. */}
            {structureOpen && !isNarrow && (
              <div className={styles.structureCell}>
                <h2 className={styles.structureHeading}>Structure</h2>
                <StructurePanel trip={trip} onOpenEntry={setEditingId} />
              </div>
            )}
          </div>
        </section>

        <BundlePanel
          tripId={trip.id}
          bundles={bundles}
          archivedBundles={archivedBundles}
          members={members}
          query={bundlesQuery}
          onOpen={setEditingId}
          onToast={(message) => show(message, 'success')}
        />
      </div>

      {/* Narrow viewports: the same tree, presented as the shared Drawer — a
          panel over the board rather than a fourth thing crammed into one
          column. Mounted only while open AND narrow, so the desktop pane and
          this dialog can never be in the accessibility tree together. */}
      {structureOpen && isNarrow && (
        <Drawer open onClose={closeStructure} title="Structure">
          <StructurePanel trip={trip} onOpenEntry={openEntryFromDrawer} />
        </Drawer>
      )}

      {editingId !== null && <EntryDetailModal entryId={editingId} onClose={closeEditing} />}

      <DragOverlay>
        {activeDrag && (
          <Card padding={2} className={styles.dragOverlayCard}>
            <EntryRow title={activeDrag.title} kept={false} />
          </Card>
        )}
      </DragOverlay>
    </DndContext>
  );
}
