import { useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useCanEdit } from '../auth/TripRoleContext';
import { QueryGate } from '../components/QueryGate';
import { useToast } from '../components/Toast';
import { useArchiveEntry, useCreateEntry, useEntries, useUpdateEntry } from '../api';
import type { Entry, EntryCategory } from '../api/types';
import { Chip } from '../design/components/core/Chip';
import { Input } from '../design/components/core/Input';
import { GROUP_MODES } from '../features/board/filters';
import { useBundleMembers } from '../features/board/useBundleMembers';
import { useLinkMutations } from '../features/board/useLinkMutations';
import { isWithinBounds } from '../features/map/bounds';
import { DroppedPinCard } from '../features/map/DroppedPinCard';
import { MapFilterBar } from '../features/map/MapFilterBar';
import { EMPTY_MAP_FILTERS, applyMapFilters } from '../features/map/mapFilters';
import type { MapFilters } from '../features/map/mapFilters';
import { MapIdeaList } from '../features/map/MapIdeaList';
import {
  counterLine,
  findDuplicateIdea,
  groupLocated,
  isNestedIdea,
  metaLineFor,
  placelessIdeas,
} from '../features/map/mapScreen';
import type { LocatedEntry, MapGroupMode } from '../features/map/mapScreen';
import { MapSearch } from '../features/map/MapSearch';
import { MapSelectionBar } from '../features/map/MapSelectionBar';
import { MapView } from '../features/map/MapView';
import { PlacePreviewCard } from '../features/map/PlacePreviewCard';
import { PlansDropdown } from '../features/map/PlansDropdown';
import { entriesWithCoordinates, entryToPin } from '../features/map/pins';
import type { Bounds, GeocodeResult, MapPin } from '../features/map/types';
import styles from './TripMap.module.css';

/** The one sentence every failed write on this screen says — the board's own. */
const SAVE_FAILED = "That didn't save. It's still here — try again.";

/**
 * A toast that carries an offer (Undo, Go to it) lingers longer than a plain
 * remark, because the reader has to decide, not just notice.
 */
const KEPT_TOAST_MS = 6000;

/**
 * The id a previewed place's "centre on it" viewRequest travels under. A
 * negative number because it is not an entry — the point being looked at is
 * not on the board yet, and a real id here could collide with one that is.
 */
const PREVIEW_POINT_ID = -2;

/**
 * The two ways a pin can be waiting to land, or null when none is:
 *  - 'new'      — a search that found nothing, carried here as a name; the
 *                 card lets it be edited before the idea exists.
 *  - 'existing' — a placeless idea from the list's footer; the name is
 *                 already settled, only the point is being chosen.
 * `point` appears after the first map click and moves with every further
 * click until the card commits or cancels.
 */
type DropMode =
  | { kind: 'new'; name: string; point?: { lat: number; lng: number } }
  | { kind: 'existing'; id: number; point?: { lat: number; lng: number } };

/**
 * The short name a geocoder label leads with — Nominatim's display_name is
 * "Name, street, town, …". MUST stay in step with PlacePreviewCard's own
 * placeName: the card shows this as the strong line, and the entry created
 * from it stores the same word, so what you read is what gets kept.
 */
function placeName(label: string): string {
  const first = label.split(',')[0].trim();
  return first !== '' ? first : label;
}

/**
 * /trips/:id/map — the map-driven planning screen. TripLayout draws the
 * header and tabs; this owns the body only: a control row (plans, filters,
 * the follow switch), then the list on the left and the map on the right.
 *
 * The organising idea is that the MAP decides the list, not the other way
 * round. Every located idea is always a pin — filters and the viewport only
 * change how a pin draws (chip / dot / faint), never whether it exists — and
 * the list beside it holds the ideas the current view and filters agree on,
 * for as long as the follow switch says the viewport may narrow it.
 *
 * Talks to the map only through features/map's provider-agnostic seam
 * (<MapView>, <MapSearch>) — nothing here imports `leaflet`, so swapping the
 * renderer later doesn't touch this file. All list derivations are the pure
 * functions in mapScreen.ts, which is what keeps this file wiring rather
 * than arithmetic.
 */
export function TripMap() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const { show } = useToast();
  const canEdit = useCanEdit();

  // Deliberately no include_archived: the map reads what is live, and the
  // server already excludes archived by default — the client-side filter
  // below is belt-and-braces against a cache primed by the board's
  // include_archived query shape ever leaking through.
  const ideasQuery = useEntries({ trip_id: trip.id, kind: 'idea' });
  const bundlesQuery = useEntries({ trip_id: trip.id, kind: 'bundle' });

  const createEntry = useCreateEntry();
  const archiveEntry = useArchiveEntry();
  const { addLink, removeLink } = useLinkMutations();

  // ---- Screen state ---------------------------------------------------------
  const [filters, setFilters] = useState<MapFilters>(EMPTY_MAP_FILTERS);
  const [groupMode, setGroupMode] = useState<MapGroupMode>('none');
  // Following is the honest default: the screen's promise is "the map decides
  // the list", and opening with the switch off would make the first pan feel
  // like a map that does nothing.
  const [followOn, setFollowOn] = useState(true);
  const [mapBounds, setMapBounds] = useState<Bounds | null>(null);
  // Nonces, not booleans: "fit" and "look here" are things that HAPPENED, and
  // the same thing can happen twice — see MapView's fitRequest/viewRequest.
  const [fitRequest, setFitRequest] = useState(0);
  const [viewRequest, setViewRequest] = useState<{
    points: { id: number; lat: number; lng: number }[];
    nonce: number;
  } | null>(null);
  const viewNonce = useRef(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [previewPlace, setPreviewPlace] = useState<{ place: GeocodeResult; duplicate?: LocatedEntry } | null>(null);
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [dropMode, setDropMode] = useState<DropMode | null>(null);
  // Bumped after every finished capture so MapSearch clears itself; the
  // initial value never counts as a bump (MapSearch's ref-guard idiom).
  const [clearNonce, setClearNonce] = useState(0);
  // The apricot "just added" edge in the list. Held until the NEXT successful
  // add rather than a timer, because "the newest thing here" stays true until
  // something newer arrives — a timer would have it fade mid-read.
  const [justAddedId, setJustAddedId] = useState<number | null>(null);

  // The one hook that needs an id at hook time. -1 while no existing-idea drop
  // is underway; by the time `mutate` is called the render that offered the
  // card has already bound the right id, so the closure is always current.
  const updateEntry = useUpdateEntry(dropMode?.kind === 'existing' ? dropMode.id : -1);

  // ---- The pipeline: ideas -> located/placeless -> filtered -> rows ---------
  const ideas = useMemo(() => (ideasQuery.data ?? []).filter((e) => !e.archived_at), [ideasQuery.data]);
  const bundles = useMemo(() => (bundlesQuery.data ?? []).filter((e) => !e.archived_at), [bundlesQuery.data]);
  const members = useBundleMembers(bundles);

  const ideaById = useMemo(() => new Map(ideas.map((entry) => [entry.id, entry])), [ideas]);
  const ideaIds = useMemo<ReadonlySet<number>>(() => new Set(ideas.map((entry) => entry.id)), [ideas]);

  const located = useMemo(() => entriesWithCoordinates(ideas) as LocatedEntry[], [ideas]);
  const placeless = useMemo(() => placelessIdeas(ideas), [ideas]);

  const filtered = useMemo(() => applyMapFilters(located, filters) as LocatedEntry[], [located, filters]);

  // The viewport cut, applied only while following — and only once the map
  // has actually said where it is looking. Before the first bounds report the
  // whole filtered list stands, so a slow first paint never opens on "no
  // ideas in view".
  const rows = useMemo(
    () =>
      followOn && mapBounds !== null
        ? filtered.filter((entry) => isWithinBounds({ id: entry.id, lat: entry.lat, lng: entry.lng }, mapBounds))
        : filtered,
    [followOn, mapBounds, filtered],
  );

  const groups = useMemo(() => groupLocated(rows, groupMode), [rows, groupMode]);

  const metaLines = useMemo(() => {
    const map = new Map<number, string>();
    for (const entry of rows) map.set(entry.id, metaLineFor(entry, ideas, ideaById));
    return map;
  }, [rows, ideas, ideaById]);

  // ---- Pins: every located idea, never removed ------------------------------
  // Filters and the viewport decide how a pin DRAWS, never whether it exists:
  //   chip  — in the list beside the map right now
  //   dot   — passes the filters, but the view has panned away from it
  //   faint — filtered out of the current reading, still on the board
  const rowIds = useMemo<ReadonlySet<number>>(() => new Set(rows.map((entry) => entry.id)), [rows]);
  const filteredIds = useMemo<ReadonlySet<number>>(() => new Set(filtered.map((entry) => entry.id)), [filtered]);

  const pins = useMemo<MapPin[]>(
    () =>
      located.map((entry) => {
        const pin = entryToPin(entry);
        pin.mark = rowIds.has(entry.id) ? 'chip' : filteredIds.has(entry.id) ? 'dot' : 'faint';
        if (isNestedIdea(entry, ideaIds)) pin.nested = true;
        return pin;
      }),
    [located, rowIds, filteredIds, ideaIds],
  );

  const counter = counterLine(rows.length, located.length, followOn);
  const firstSelectedTitle = selectedIds.length > 0 ? (ideaById.get(selectedIds[0])?.title ?? null) : null;

  // ---- Movement requests ----------------------------------------------------
  /** "Show me these" — the only way this file ever moves the map on purpose. */
  function lookAt(points: { id: number; lat: number; lng: number }[]) {
    if (points.length === 0) return;
    viewNonce.current += 1;
    setViewRequest({ points, nonce: viewNonce.current });
  }

  function lookAtIdea(id: number) {
    const entry = located.find((e) => e.id === id);
    if (entry) lookAt([{ id: entry.id, lat: entry.lat, lng: entry.lng }]);
  }

  // ---- Selection: one set, ticked in the list or clicked on the map ---------
  function toggleSelected(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function addSelected(ids: number[]) {
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  }

  /**
   * A pin click toggles the same set a row's circle does. Ignored entirely
   * while a pin is being dropped — the reader is aiming at the ground, and a
   * near-miss on a pin that flipped a selection would be a click doing a
   * different verb than the one on their mind. Viewers have no selection to
   * toggle (the bar below only reads), so their pin clicks are quiet too.
   */
  function handleSelectPin(id: number) {
    if (dropMode !== null) return;
    if (!canEdit) return;
    toggleSelected(id);
  }

  // ---- Map clicks: drop a pin, or dismiss the preview -----------------------
  /**
   * Only bound while editing (viewers have no capture flows for a click to
   * feed). In drop mode every click places — or moves — the pending point;
   * otherwise a bare click on the ground stands the preview card down, the
   * same "clicked away" dismissal every popover on this screen has.
   */
  function handleMapClick(lat: number, lng: number) {
    if (dropMode !== null) {
      setDropMode({ ...dropMode, point: { lat, lng } });
      setPendingLocation({ lat, lng });
      return;
    }
    if (previewPlace !== null) {
      setPreviewPlace(null);
      setPendingLocation(null);
    }
  }

  // ---- Capture: search -> preview -> keep -----------------------------------
  /** Every successful capture ends the same way: card down, ring off, search cleared, newest marked. */
  function finishAdd(entry: Entry) {
    setPreviewPlace(null);
    setPendingLocation(null);
    setClearNonce((n) => n + 1);
    setJustAddedId(entry.id);
  }

  /**
   * The kept toast, in its two variants. One action per toast — the Toast
   * component offers a single follow-up by design — so when the new pin sits
   * outside the current view the offer is "Go to it" and Undo is not also
   * offered; archiving stays a click away through the list. The map is never
   * moved automatically on add: landing somewhere you were not looking is
   * said in words, and going there stays the reader's choice.
   *
   * `mapBounds` here is the render the add finished on — if the map moved
   * during the round-trip the sentence could be a beat stale, which reads as
   * caution ("outside what you are looking at") and never hides the entry.
   */
  function keptToast(entry: Entry) {
    const outside =
      mapBounds !== null &&
      entry.lat !== null &&
      entry.lng !== null &&
      !isWithinBounds({ id: entry.id, lat: entry.lat, lng: entry.lng }, mapBounds);
    if (outside) {
      show(`Kept — ${entry.title} is on your map. It sits outside what you are looking at.`, 'success', {
        durationMs: KEPT_TOAST_MS,
        action: {
          label: 'Go to it',
          onClick: () => lookAt([{ id: entry.id, lat: entry.lat as number, lng: entry.lng as number }]),
        },
      });
    } else {
      show(`Kept — ${entry.title} is on your map.`, 'success', {
        durationMs: KEPT_TOAST_MS,
        action: { label: 'Undo', onClick: () => archiveEntry.mutate(entry.id) },
      });
    }
  }

  /**
   * A picked search result: preview it where it is. The card gets the
   * duplicate reading (an idea already at this spot, if any), the map gets
   * the apricot ring and centres on the point — centring is showing what was
   * asked about, not a viewport cut, so it happens even with follow on.
   */
  function handlePickPlace(place: GeocodeResult) {
    setDropMode(null);
    setPreviewPlace({ place, duplicate: findDuplicateIdea(place, located) });
    setPendingLocation({ lat: place.lat, lng: place.lng });
    lookAt([{ id: PREVIEW_POINT_ID, lat: place.lat, lng: place.lng }]);
  }

  /** A picked idea match: go to it, and pick it up into the working selection. */
  function handlePickIdea(id: number) {
    lookAtIdea(id);
    if (canEdit) addSelected([id]);
  }

  /**
   * "Add as idea" — the place becomes a board idea under the trip. The title
   * is the same first-comma-segment the card leads with (see placeName), the
   * full label is kept as the address, and 'place' is the honest category for
   * something that arrived as a point on a map.
   */
  async function handleAddAsIdea(place: GeocodeResult) {
    try {
      const entry = await createEntry.mutateAsync({
        entry: {
          kind: 'idea',
          title: placeName(place.label),
          address: place.label,
          lat: place.lat,
          lng: place.lng,
          category: 'place' as EntryCategory,
        },
        parent_id: trip.id,
      });
      finishAdd(entry);
      keptToast(entry);
    } catch {
      show(SAVE_FAILED, 'error');
    }
  }

  /**
   * "Add to a plan" — the same create, then a link into the chosen bundle.
   * Undo unwinds both halves: the link through removeLink (useLinkMutations
   * takes the parent at call time, which useDeleteLink cannot), and the idea
   * through archive. Archiving alone would hide it, but the plan would keep a
   * member row pointing at an archived idea — worth the second request.
   */
  async function handleAddToPlan(place: GeocodeResult, planId: number) {
    const plan = bundles.find((b) => b.id === planId);
    try {
      const entry = await createEntry.mutateAsync({
        entry: {
          kind: 'idea',
          title: placeName(place.label),
          address: place.label,
          lat: place.lat,
          lng: place.lng,
          category: 'place' as EntryCategory,
        },
        parent_id: trip.id,
      });
      await addLink.mutateAsync({ parentId: planId, childId: entry.id });
      finishAdd(entry);
      show(`Kept, and added to ${plan?.title ?? 'the plan'}. Still on your board too.`, 'success', {
        durationMs: KEPT_TOAST_MS,
        action: {
          label: 'Undo',
          onClick: () => {
            removeLink.mutate({ parentId: planId, childId: entry.id });
            archiveEntry.mutate(entry.id);
          },
        },
      });
    } catch {
      show(SAVE_FAILED, 'error');
    }
  }

  /** The duplicate card's "Show in list": go to what you already have instead. */
  function handleShowInList() {
    const dup = previewPlace?.duplicate;
    if (!dup) return;
    if (canEdit) addSelected([dup.id]);
    lookAt([{ id: dup.id, lat: dup.lat, lng: dup.lng }]);
    setPreviewPlace(null);
    setPendingLocation(null);
  }

  // ---- Dropped pins ---------------------------------------------------------
  /** MapSearch's dead end: carry the query in as the new idea's working name. */
  function handleDropPinIntent(query: string) {
    setPreviewPlace(null);
    setPendingLocation(null);
    setDropMode({ kind: 'new', name: query });
  }

  /** The placeless footer's "Put it on the map". */
  function handlePutOnMap(id: number) {
    setPreviewPlace(null);
    setPendingLocation(null);
    setDropMode({ kind: 'existing', id });
  }

  function exitDropMode() {
    setDropMode(null);
    setPendingLocation(null);
  }

  async function handleDropConfirm() {
    if (dropMode === null || dropMode.point === undefined) return;
    const { point } = dropMode;
    if (dropMode.kind === 'new') {
      try {
        // No address: a hand-dropped pin has coordinates and a name, and
        // writing a made-up address would be claiming a fact nobody gave.
        const entry = await createEntry.mutateAsync({
          entry: {
            kind: 'idea',
            title: dropMode.name.trim(),
            lat: point.lat,
            lng: point.lng,
            category: 'place' as EntryCategory,
          },
          parent_id: trip.id,
        });
        setJustAddedId(entry.id);
        keptToast(entry);
        exitDropMode();
      } catch {
        show(SAVE_FAILED, 'error');
      }
    } else {
      const title = ideaById.get(dropMode.id)?.title ?? 'It';
      updateEntry.mutate(
        { entry: { lat: point.lat, lng: point.lng } },
        {
          onSuccess: () => {
            show(`${title} is on the map now. It joins the list.`, 'success');
            exitDropMode();
          },
          onError: () => show(SAVE_FAILED, 'error'),
        },
      );
    }
  }

  const captureBusy = createEntry.isPending || addLink.isPending || updateEntry.isPending;

  const dropBanner =
    dropMode === null
      ? null
      : dropMode.kind === 'existing'
        ? `Click where ${ideaById.get(dropMode.id)?.title ?? 'it'} is`
        : 'Click where it is';

  return (
    <div className={styles.screen}>
      {/* The control row: what plans exist, what narrows the map, and whether
          the map may narrow the list. All reading-chrome, so it stands outside
          the QueryGate the way the board's FilterBar does. */}
      <div className={styles.controls}>
        <PlansDropdown bundles={bundles} members={members} />
        <div className={styles.filters}>
          <MapFilterBar
            filters={filters}
            onChange={setFilters}
            visibleCount={filtered.length}
            totalCount={located.length}
          />
        </div>
        <div className={styles.narrow}>
          <Input
            aria-label="Search ideas"
            placeholder="Narrow the list"
            value={filters.text}
            onChange={(e) => setFilters({ ...filters, text: e.target.value })}
          />
        </div>
        {/* aria-pressed carries the state; toggling only changes what the list
            listens to — it NEVER moves the map, which is what makes turning it
            off feel safe. */}
        <button
          type="button"
          className={styles.follow}
          aria-pressed={followOn}
          onClick={() => setFollowOn((value) => !value)}
        >
          <span aria-hidden="true">◍</span> follow map
        </button>
      </div>

      {/* Said out loud because a faint dot is easy to read as a bug: filtering
          is a way of reading the map, never an edit to the board. */}
      <p className={styles.caption}>Filtered ideas keep a faint dot on the map. Nothing leaves your board.</p>

      <QueryGate
        query={ideasQuery}
        loadingLabel="Finding your places"
        errorMessage="Your places didn't load. Nothing is lost — every pin is still where you put it."
      >
        <div className={styles.columns}>
          <div className={styles.listCol}>
            <div className={styles.groupRow} role="group" aria-label="Group ideas">
              {GROUP_MODES.map((mode) => (
                <Chip key={mode.key} selected={groupMode === mode.key} onClick={() => setGroupMode(mode.key)}>
                  {mode.label}
                </Chip>
              ))}
            </div>

            <div className={styles.counterRow}>
              <p className={styles.counter}>{counter}</p>
              {/* The way back appears exactly when the viewport is the thing
                  hiding rows — a filter's escape hatch is the chip row's own
                  "See all", not this. */}
              {followOn && rows.length < filtered.length && (
                <button type="button" className={styles.widen} onClick={() => setFitRequest((n) => n + 1)}>
                  zoom out to widen
                </button>
              )}
            </div>

            {/* The three kinds of nothing get three different sentences — only
                this file knows which nothing it is (see MapIdeaList's doc). */}
            {located.length === 0 ? (
              <p className={styles.emptyLine}>
                Nothing on the map yet. Give an idea a place and it will show up here — or search the map and keep
                what you find.
              </p>
            ) : rows.length === 0 ? (
              <p className={styles.emptyLine}>
                No ideas in view. Zoom out, or clear a chip — they are all still on the board.
              </p>
            ) : null}

            <MapIdeaList
              groups={groups}
              metaLines={metaLines}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              onRowNameClick={lookAtIdea}
              onZoomGroup={(key) => {
                const group = groups.find((g) => g.key === key);
                if (group) {
                  lookAt(
                    group.entries.map((entry) => ({
                      id: entry.id,
                      lat: entry.lat as number,
                      lng: entry.lng as number,
                    })),
                  );
                }
              }}
              justAddedId={justAddedId}
              placeless={placeless}
              onPutOnMap={handlePutOnMap}
              canEdit={canEdit}
            />
          </div>

          <div className={styles.mapCol}>
            <div className={styles.mapWrap}>
              {/* The map ALWAYS renders, even with zero located ideas — search
                  is how places arrive, and a hidden map would hide the way in.
                  selectedId stays null: the seam draws selection for one pin
                  only, and this screen's selection is a set — see the module
                  doc for the honest limitation. */}
              <MapView
                pins={pins}
                selectedId={null}
                onSelectPin={handleSelectPin}
                onSelectCluster={canEdit ? (ids) => addSelected(ids) : undefined}
                onMapClick={canEdit ? handleMapClick : undefined}
                pendingLocation={pendingLocation}
                fitToPins
                fitRequest={fitRequest}
                viewRequest={viewRequest}
                onBoundsChange={setMapBounds}
                height="100%"
                aria-label={`Map of ${trip.title}`}
              />

              <div className={styles.searchOverlay}>
                <MapSearch
                  ideas={located}
                  onPickIdea={handlePickIdea}
                  onPickPlace={handlePickPlace}
                  onDropPinIntent={handleDropPinIntent}
                  canEdit={canEdit}
                  clearNonce={clearNonce}
                />
              </div>

              {/* Works any time — re-fitting to every pin is useful whatever
                  the list is doing, and it is also what "zoom out to widen"
                  does from the list side. */}
              <button
                type="button"
                className={styles.fitAll}
                onClick={() => setFitRequest((n) => n + 1)}
              >
                <span aria-hidden="true">⤢</span> Fit all ideas
              </button>

              {/* The aiming banner, until the first click lands a point — from
                  then on the card itself says "click again to move it". */}
              {dropMode !== null && dropMode.point === undefined && (
                <p className={styles.banner}>{dropBanner}</p>
              )}

              <div className={styles.cards}>
                {dropMode !== null && dropMode.point !== undefined ? (
                  <DroppedPinCard
                    heading={
                      dropMode.kind === 'new'
                        ? 'New idea from the map'
                        : `Putting ${ideaById.get(dropMode.id)?.title ?? 'it'} on the map`
                    }
                    name={dropMode.kind === 'new' ? dropMode.name : (ideaById.get(dropMode.id)?.title ?? '')}
                    nameEditable={dropMode.kind === 'new'}
                    onNameChange={(value) =>
                      setDropMode((prev) => (prev !== null && prev.kind === 'new' ? { ...prev, name: value } : prev))
                    }
                    lat={dropMode.point.lat}
                    lng={dropMode.point.lng}
                    ctaLabel={dropMode.kind === 'new' ? 'Add as idea' : 'Save the place'}
                    onConfirm={handleDropConfirm}
                    onCancel={exitDropMode}
                    busy={captureBusy}
                  />
                ) : previewPlace !== null ? (
                  <PlacePreviewCard
                    place={previewPlace.place}
                    duplicate={previewPlace.duplicate ? { idea: previewPlace.duplicate } : undefined}
                    plans={bundles}
                    busy={captureBusy}
                    canEdit={canEdit}
                    onAddAsIdea={() => handleAddAsIdea(previewPlace.place)}
                    onAddToPlan={(planId) => handleAddToPlan(previewPlace.place, planId)}
                    onShowInList={handleShowInList}
                    onKeepSeparately={() => handleAddAsIdea(previewPlace.place)}
                    onDismiss={() => {
                      setPreviewPlace(null);
                      setPendingLocation(null);
                    }}
                  />
                ) : null}
              </div>
            </div>

            <MapSelectionBar
              selectedIds={selectedIds}
              bundles={bundles}
              members={members}
              tripId={trip.id}
              firstSelectedTitle={firstSelectedTitle}
              canEdit={canEdit}
              onClear={() => setSelectedIds([])}
              onToast={(message) => show(message, 'success')}
            />
          </div>
        </div>
      </QueryGate>
    </div>
  );
}
