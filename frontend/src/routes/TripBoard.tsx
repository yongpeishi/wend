import { useCallback, useMemo, useRef, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
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
import { PageTitle } from '../components/PageTitle';
import { QueryGate } from '../components/QueryGate';
import { useToast } from '../components/Toast';
import { useCreateEntry, useEntries, useRestoreEntry } from '../api';
import type { Entry } from '../api/types';
import { BoardMapPane } from '../features/board/BoardMapPane';
import { FilterBar } from '../features/board/FilterBar';
import { IdeaList } from '../features/board/IdeaList';
import { CaptureBar } from '../features/board/CaptureBar';
import { IdeaComposer } from '../features/board/IdeaComposer';
import type { IdeaComposerDraft } from '../features/board/IdeaComposer';
import { BulkBar } from '../features/board/BulkBar';
import { BundlePanel } from '../features/board/BundlePanel';
import { SetAsideSection } from '../features/board/SetAsideSection';
import { useBundleMembers } from '../features/board/useBundleMembers';
import { useLinkMutations } from '../features/board/useLinkMutations';
import type { BundleDropData } from '../features/board/bundleDrop';
import { BOARD_DRAG_ANNOUNCEMENTS, BOARD_DRAG_INSTRUCTIONS } from '../features/board/dragAnnouncements';
import { EMPTY_FILTERS, applyFilters, groupEntries } from '../features/board/filters';
import type { GroupMode, IdeaFilters } from '../features/board/filters';
import { ideaChildrenOf, otherParentTitles, pathToIdea, rootIdeas, subtreeCount } from '../features/board/tree';
import { isWithinBounds } from '../features/map/bounds';
import { entriesWithCoordinates, entryToPin } from '../features/map/pins';
import type { Bounds, MapPin } from '../features/map/types';
import { usePersistedFlag } from '../lib/usePersistedFlag';
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

/** The one sentence every failed write on this board says. */
const SAVE_FAILED = "That didn't save. It's still here — try again.";

/**
 * /trips/:id — the planning board. One row, three columns: the map on the
 * left as a companion to the list, the ideas in the middle, and the plans
 * rail (kind: 'bundle') on the right. Renders inside TripLayout, which draws
 * the trip title and dates; the trip's own tabs live in the app sidebar, not
 * here.
 *
 * The idea tree is navigation now. Ideas nest inside ideas — `parent_ids` is
 * many-to-many, so one idea can sit inside several others — and the board
 * shows ONE level of that tree at a time: the roots, or the children of the
 * idea you have drilled into. The scope lives in the `path` search param as a
 * comma-joined trail of idea ids, root first, so a drilled level survives a
 * reload and can be handed to someone as a link. Ids the loaded idea set
 * cannot vouch for are ignored — a stale link falls back toward the root
 * silently rather than erroring about an idea that is not there to show. The
 * breadcrumb row above the list is the same path drawn as the way back.
 *
 * Everything below the breadcrumb reads off one pipeline, in one order:
 *
 *   allIdeas -> level (children of the drill, or the roots) -> applyFilters
 *
 * Filtering and grouping are separate axes and must stay that way. The search
 * text and the chips narrow WHICH ideas of the level show; the group mode
 * only changes how the survivors are arranged. Grouping by location while
 * filtered to Food is a supported combination, not an accident.
 *
 * The map is a COMPANION, not a filter. It pins every located idea on the
 * trip whatever the drill and the chips are doing, and marks the pins of the
 * list currently on screen as labelled chips (`labeledIds`) with the rest
 * waiting as dots — so the map always answers "where is all of this?" while
 * the list answers "what am I reading right now?". The old follow-the-map
 * viewport cut is gone entirely: panning changes what the map shows, never
 * what the list holds, so the two halves can no longer disagree about what
 * exists. The pane's own "Widen" stays, because re-fitting the map to every
 * pin is useful however the list is scoped.
 *
 * Capture replaced the "+ New idea" button. The CaptureBar above the controls
 * takes a title and lands it at the level being read — quick add for the
 * common case, or the composer for the idea that arrives with a description,
 * an address, a category, or more than one parent. Ideas land under the
 * current drill id, or under the trip itself at root.
 */
export function TripBoard() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const { show } = useToast();
  // The hook rather than the outlet context: the same answer reaches the rail,
  // the rows and the bulk bar below without being threaded through four
  // components, and outside a trip it defaults to editable. TripLayout mounts
  // the provider.
  const canEdit = useCanEdit();

  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<IdeaFilters>(EMPTY_FILTERS);
  // Ungrouped is the honest starting point, and what the design shows: the
  // board opens as the whole list, and sectioning it is something you ask for.
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // The rows currently unfolded in place — a set, because opening one idea
  // must never fold another; reading two ideas side by side is the point of
  // unfolding in place. Held here rather than in the list so drilling can fold
  // them all back: expansions left open across a level change would belong to
  // rows that are no longer on screen.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(() => new Set());
  // Of the open rows, the one under attention — the last one opened or touched.
  // Several rows can be open at once, but only one wears the apricot "I'm
  // here" edge, and only the board can arbitrate which: a row knows it was
  // touched, never that some other row was touched more recently. Cleared when
  // its row closes and on every drill, alongside the expansions it qualifies.
  const [focusedId, setFocusedId] = useState<number | null>(null);
  // The composer: whether it is up, the words already typed when it was asked
  // for, and WHERE it is standing.
  //
  // `initialTitle` is the carry-over — opening the composer must not cost the
  // reader the title they started in the capture bar.
  //
  // `at` is the host: the id of the idea whose card is holding the composer
  // inside itself, or null for the one instance that lives at the top of the
  // list under the capture bar. It is one field rather than two pieces of
  // state because there is only ever ONE composer on the board — the
  // top-of-list card renders on `at === null`, a row renders it on
  // `at === entry.id`, and those are mutually exclusive by construction. Two
  // booleans could disagree; a single `at` cannot. It is also why "add an
  // idea inside" needs no closing of anything: moving the composer IS moving
  // this number.
  const [composer, setComposer] = useState<{ open: boolean; initialTitle: string; at: number | null }>({
    open: false,
    initialTitle: '',
    at: null,
  });
  const [activeDrag, setActiveDrag] = useState<{ entryId: number; title: string } | null>(null);
  const lastSelectedId = useRef<number | null>(null);

  // The map starts DOWN. It used to start open, on the argument that where a
  // trip's ideas are is half of what the board says about them — but the board
  // is a list you read and add to, and a map above it pushed the ideas
  // themselves below the fold on arrival every single time. Whoever wants the
  // map wants it for a moment, deliberately; the "Show map" chip in the
  // controls row is one click away and the pane's own header puts it back down.
  const [mapOpen, setMapOpen] = useState(false);
  // The plans rail folded to a sliver, desktop only — the map's opposite
  // number on the other edge of the board. Unlike the map this one is
  // remembered across visits: folding the rail is a reading-mode preference
  // about the board itself, not a moment's errand, so it comes back the way
  // it was left. Below the one-column breakpoint the flag is inert — the CSS
  // that acts on it is scoped to the wide layout.
  const [plansCollapsed, togglePlansCollapsed] = usePersistedFlag('wend:plans-collapsed', false);
  // Kept only for the pane's own report: how many located ideas sit outside
  // the current view, which is what decides whether "Widen" is worth offering.
  // The list never reads this — the viewport cut is gone.
  const [mapBounds, setMapBounds] = useState<Bounds | null>(null);
  // A nonce, not a boolean: "widen" is something that HAPPENED, and the same
  // thing can happen twice. See MapView's `fitRequest`.
  const [fitRequest, setFitRequest] = useState(0);
  // Picking several ideas is a mode, not a permanent column of checkboxes.
  const [selectMode, setSelectMode] = useState(false);
  // The pin the reader last pointed at, held here only to draw it as "this one".
  const [pinnedId, setPinnedId] = useState<number | null>(null);

  const restoreEntry = useRestoreEntry();
  const createEntry = useCreateEntry();
  const { addLink } = useLinkMutations();

  // A stable handle, not an inline arrow: components with focus effects
  // memoize against their close callback to keep those effects from re-firing
  // on every board render. Modal.tsx's own doc comment has the underlying
  // behaviour.
  const closeComposer = useCallback(() => setComposer({ open: false, initialTitle: '', at: null }), []);

  /**
   * "Add an idea inside" on a row: the composer moves into that row's card,
   * with nothing typed to carry over — the press came from the card, not from
   * a half-written line in the capture bar.
   *
   * A stable handle for the same reason `closeComposer` is one, and more so:
   * this one is threaded down through `IdeaList` into every row, so an inline
   * arrow here would hand a fresh identity to the whole list on every board
   * render.
   */
  const openComposerInside = useCallback(
    (id: number) => setComposer({ open: true, initialTitle: '', at: id }),
    [],
  );

  const ideasQuery = useEntries({ trip_id: trip.id, kind: 'idea', include_archived: true });
  const bundlesQuery = useEntries({ trip_id: trip.id, kind: 'bundle', include_archived: true });

  const allIdeas = useMemo(() => (ideasQuery.data ?? []).filter((e) => !e.archived_at), [ideasQuery.data]);
  const archivedIdeas = useMemo(() => (ideasQuery.data ?? []).filter((e) => e.archived_at), [ideasQuery.data]);
  const bundles = useMemo(() => (bundlesQuery.data ?? []).filter((e) => !e.archived_at), [bundlesQuery.data]);
  const archivedBundles = useMemo(() => (bundlesQuery.data ?? []).filter((e) => e.archived_at), [bundlesQuery.data]);

  const members = useBundleMembers(bundles);

  const ideaById = useMemo(() => new Map(allIdeas.map((entry) => [entry.id, entry])), [allIdeas]);

  // ---- The drill-down path -------------------------------------------------
  // Read straight off the URL every render, validated against the loaded idea
  // set rather than trusted: an id the set cannot vouch for is dropped, so a
  // stale or hand-edited link degrades toward the root instead of drilling
  // into nothing. The URL itself is never rewritten by the validation — while
  // the ideas are still loading the set is empty and everything is "unknown",
  // and clobbering the param then would throw away a perfectly good link the
  // moment before the data arrived to honour it.
  const path = useMemo(() => {
    const raw = searchParams.get('path');
    if (!raw) return [];
    return raw
      .split(',')
      .map((piece) => Number(piece))
      .filter((id) => Number.isInteger(id) && ideaById.has(id));
  }, [searchParams, ideaById]);

  const currentId = path.length > 0 ? path[path.length - 1] : null;
  const currentIdea = currentId !== null ? ideaById.get(currentId) : undefined;

  const setPath = useCallback(
    (ids: number[]) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (ids.length > 0) next.set('path', ids.join(','));
          else next.delete('path');
          return next;
        },
        { replace: false },
      );
      // Every level change closes the composer, for the same reason it folds
      // every open row: the composer is standing somewhere — inside a card
      // that is about to leave the screen, or above a list that is about to
      // become a different list — and a half-written idea pointed at a level
      // nobody is reading any more is worse than no composer at all. Closed
      // HERE rather than in `drillInto` alone, because the breadcrumbs change
      // the path too; one place makes it true of every way down and back.
      closeComposer();
    },
    [setSearchParams, closeComposer],
  );

  /**
   * Down one level. Drilling clears every expansion (they belonged to rows
   * that are about to leave the screen) and the search text (typed against
   * the level you were reading, and carrying it down would greet the new
   * level with a narrowing nobody asked of it). The chips survive on purpose:
   * "food only" is a way of reading the whole trip, not one level of it.
   */
  function drillInto(id: number) {
    setPath([...path, id]);
    setExpandedIds(new Set());
    // The focus belonged to one of the rows just folded — it goes with them.
    setFocusedId(null);
    setFilters((previous) => ({ ...previous, text: '' }));
  }

  /**
   * The plans rail's way in: clicking an idea in a plan NAVIGATES the board to
   * that idea — the drill lands on the level its row lives on (pathToIdea),
   * the row opens focused, and the list scrolls until it is in view. It used
   * to raise the idea's detail dialog over the board instead; the row already
   * says everything the dialog said, so the honest answer to "where is this?"
   * is to go there.
   *
   * The filters reset whole, not just the search text: the jump was aimed at
   * one specific row, and a chip that hides it would make this navigation to
   * nowhere. The scroll waits one frame because the row may not exist yet —
   * the drill re-renders the level first, and only then is there a
   * `data-entry-id` to bring into view.
   */
  function openIdeaFromPlan(id: number) {
    setPath(pathToIdea(allIdeas, id));
    setFilters(EMPTY_FILTERS);
    setExpandedIds(new Set([id]));
    setFocusedId(id);
    requestAnimationFrame(() => {
      document.querySelector(`[data-entry-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  // ---- One level of the tree, then the filters ------------------------------
  const levelIdeas = useMemo(
    () => (currentId !== null ? ideaChildrenOf(allIdeas, currentId) : rootIdeas(allIdeas)),
    [allIdeas, currentId],
  );

  const visibleIdeas = useMemo(() => applyFilters(levelIdeas, filters), [levelIdeas, filters]);

  // The per-row tree facts, computed once here — the only place that holds the
  // whole idea set — and handed down as plain data so the rows never learn the
  // tree exists. Counts for the visible rows only: the hidden ones have no row
  // to say a number on.
  const insideCounts = useMemo(
    () => new Map(visibleIdeas.map((entry) => [entry.id, subtreeCount(allIdeas, entry.id)])),
    [visibleIdeas, allIdeas],
  );

  const otherParents = useMemo(
    () => new Map(visibleIdeas.map((entry) => [entry.id, otherParentTitles(allIdeas, entry, currentId)])),
    [visibleIdeas, allIdeas, currentId],
  );

  const currentInsideCount = currentId !== null ? subtreeCount(allIdeas, currentId) : 0;

  // Whether the counts are facts yet — see countKnown on FilterBar and
  // BoardMapPane. One flag, because both would otherwise work it out from the
  // same query and could disagree.
  const countKnown = !ideasQuery.isPending && !ideasQuery.isError;

  // ---- The map, as a companion ----------------------------------------------
  // Pins come off EVERY located idea of the trip, not the filtered level: the
  // map's job is "where is all of this?", and a map that lost pins as you
  // drilled would answer a different question than the one it is asked. Which
  // ideas are in the list on screen is said with marks instead — labelled
  // chips for the visible list, dots for the rest — decided by `labeledIds`
  // inside BoardMapPane.
  const pins = useMemo<MapPin[]>(
    () =>
      entriesWithCoordinates(allIdeas).map((entry) => entryToPin(entry as Entry & { lat: number; lng: number })),
    [allIdeas],
  );

  const labeledIds = useMemo<ReadonlySet<number>>(() => new Set(visibleIdeas.map((entry) => entry.id)), [visibleIdeas]);

  // What the map thinks is off-screen — what its own pill reports and what
  // decides whether "Widen" is worth offering. A fact about the map alone: the
  // list stopped listening to the viewport when the follow switch left.
  const offViewCount = useMemo(() => {
    if (!mapOpen || !mapBounds) return 0;
    return allIdeas.filter(
      (entry) =>
        entry.lat !== null &&
        entry.lng !== null &&
        !isWithinBounds({ id: entry.id, lat: entry.lat, lng: entry.lng }, mapBounds),
    ).length;
  }, [allIdeas, mapOpen, mapBounds]);

  // Shift-select ranges follow the order the list actually renders in, so the
  // range a user sees between two clicks is the range they get.
  const orderedVisibleIds = useMemo(
    () => groupEntries(visibleIdeas, groupMode).flatMap((group) => group.entries.map((e) => e.id)),
    [visibleIdeas, groupMode],
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
   * Closing the map forgets where it was looking: the bounds would be a stale
   * fact about a map nobody can see, and the map itself unmounts rather than
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
   * the reason you can build a plan from either side of the screen. Out of
   * select mode there is nothing to tick, so it just marks the pin as the one
   * you mean, the same way hovering a row does on /library.
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

  // ---- Capture ---------------------------------------------------------------
  /** The fast path: a title, landed at the level being read, nothing else asked. */
  function handleQuickAdd(title: string) {
    // Per-call promise rather than per-call callbacks: two quick adds must each
    // get their own toast (see handleDragEnd for why mutate's callbacks can't).
    void createEntry.mutateAsync({ entry: { kind: 'idea', title }, parent_id: currentId ?? trip.id }).then(
      () => show(`Added "${title}". Nothing locked in.`, 'success'),
      () => show(SAVE_FAILED, 'error'),
    );
  }

  /**
   * The slow path — the capture bar hands over whatever was already typed.
   * `at: null` is the composer's home address: asking from the bar always
   * brings it back to the top of the list, wherever it had been standing.
   */
  function handleOpenComposer(draft: string) {
    setComposer({ open: true, initialTitle: draft, at: null });
  }

  /**
   * The composer's parents are real links, so more than one costs more than
   * one request: the first parent is the create's own `parent_id` (the trip
   * when none was picked), and each remaining one is a link POSTed after the
   * idea exists. Sequenced with `mutateAsync` because the later links need the
   * new idea's id; a failure anywhere lands on the house sentence, and the
   * composer stays up so nothing typed is lost.
   *
   * The CHIPS are the parent set, not the level on screen: the composer opened
   * inside a card seeds itself with that card, and the composer at the top of
   * the list seeds itself with the drill — but either can be edited before
   * submit, and what is left in the chips at that moment is where the idea
   * goes. Emptied to nothing, `parent_id` falls back to the trip and the idea
   * lands at top level, which is a legitimate thing to ask for.
   */
  async function handleComposerSubmit(draft: IdeaComposerDraft) {
    const [firstParentId, ...remainingParentIds] = draft.parentIds;
    // Read BEFORE the await: `closeComposer()` runs inside the try below, so
    // by the time there is a toast to say, `composer.at` in a later render
    // would already be null. The host is a fact about the moment the submit
    // was made.
    const host = composer.at !== null ? ideaById.get(composer.at) : undefined;
    try {
      const entry = await createEntry.mutateAsync({
        entry: {
          kind: 'idea',
          title: draft.title,
          description: draft.description === '' ? null : draft.description,
          // Same rule as the address below: the composer no longer lights a
          // category chip by default, so "nothing chosen" is a real answer and
          // must be left unsaid rather than written onto the entry as null.
          ...(draft.category !== null ? { category: draft.category } : {}),
          // Only when there is one: an empty string written onto the entry
          // would read as "an address was given and it is nothing".
          ...(draft.address.trim() !== '' ? { address: draft.address } : {}),
        },
        parent_id: firstParentId ?? trip.id,
      });
      await Promise.all(
        remainingParentIds.map((parentId) => addLink.mutateAsync({ parentId, childId: entry.id })),
      );
      closeComposer();
      // Three different things just happened, and they do not share a
      // sentence. Nowhere chosen is worth saying plainly. Landing inside the
      // card the composer was standing in is worth counting, because the count
      // is the reassurance: the idea went where you were looking.
      //
      // `+ 1` is not an off-by-one. `allIdeas` in this closure is the PRE-ADD
      // snapshot of the query data — the create's refetch has not repainted
      // this render — so the child just made is not in it yet. And
      // `subtreeCount` is the very function the row's "N inside ›" pill reads,
      // so the number said here and the number drawn there are the same number
      // by construction rather than by agreement.
      if (draft.parentIds.length === 0) {
        show(`Added "${draft.title}" at top level.`, 'success');
      } else if (host !== undefined && draft.parentIds.includes(host.id)) {
        const n = subtreeCount(allIdeas, host.id) + 1;
        show(`Added inside ${host.title}. ${n === 1 ? 'First one.' : `${n} so far.`}`, 'success');
      } else {
        show(`Added "${draft.title}". Nothing locked in.`, 'success');
      }
    } catch {
      show(SAVE_FAILED, 'error');
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { entryId: number; title: string } | undefined;
    if (data) setActiveDrag(data);
  }

  /**
   * There is one kind of drop target left: a plan that already exists. It is
   * recognised by its droppable data rather than by parsing its id — see
   * bundleDrop.ts, which also records what the second kind used to be and why
   * the dashed "start a bundle" target is gone.
   *
   * Dropping onto a plan COPIES the link and never removes the old one, so an
   * idea can belong to several plans at once. Nothing here creates anything:
   * a plan is made by naming it, in the rail's own header.
   */
  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const entryData = active.data.current as { entryId: number; title: string } | undefined;
    const overData = over.data.current as BundleDropData | undefined;
    if (!entryData || !overData) return;

    if (overData.bundleId === undefined) return;
    const bundleTitle = overData.title ?? 'the plan';
    // mutateAsync, not mutate(vars, { onSuccess, onError }): TanStack Query
    // only keeps the per-call callbacks of the LATEST mutate on an observer,
    // so a second drop before the first has settled would leave the first to
    // roll back with no toast. The promise belongs to this call alone.
    void addLink.mutateAsync({ parentId: overData.bundleId, childId: entryData.entryId }).then(
      () => show(`Added ${entryData.title} to ${bundleTitle}.`, 'success'),
      () => show(SAVE_FAILED, 'error'),
    );
  }

  return (
    <DndContext
      sensors={sensors}
      // The board's own words for the live region, in place of dnd-kit's
      // "Draggable item idea-1022…" defaults — see dragAnnouncements.ts.
      accessibility={{ announcements: BOARD_DRAG_ANNOUNCEMENTS, screenReaderInstructions: BOARD_DRAG_INSTRUCTIONS }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      {/* The screen's own name, in the one page-title style every trip tab
          shares. It sits OUTSIDE .board on purpose: the board is a full-bleed
          row of columns, and a title dropped into it would head the ideas
          column rather than the page — indented past the map whenever the map
          pane is open. Out here it keeps the wrap's gutter and reading measure,
          so it lines up under the trip title exactly as the other tabs' do.

          It does not replace the "All ideas" crumb further down: that one is a
          scope line saying where in the idea tree the list is standing, and it
          turns into a trail as soon as you drill. This says what page you are
          on, which stays true at every depth. */}
      <div className={styles.pageTitle}>
        <PageTitle>Ideas</PageTitle>
      </div>

      <div className={styles.board}>
        {/* Rendered only while open, never merely hidden. See toggleMap. */}
        {mapOpen && (
          <div className={styles.mapCol}>
            <BoardMapPane
              pins={pins}
              selectedId={pinnedId}
              onSelectPin={handleSelectPin}
              onSelectCluster={handleSelectCluster}
              onBoundsChange={setMapBounds}
              fitRequest={fitRequest}
              // The list no longer follows the map — the honest value, and
              // what keeps the pane's pill from claiming a cut that no longer
              // happens.
              following={false}
              offCount={offViewCount}
              onWiden={() => setFitRequest((n) => n + 1)}
              countKnown={countKnown}
              labeledIds={labeledIds}
              onHide={toggleMap}
            />
          </div>
        )}

        <section className={styles.ideas} aria-label="Ideas">
          {/* Capture is the way ideas arrive now, so it sits above everything
              else in the column — including the controls, because adding is
              more common than narrowing. Editors only: a viewer's board has
              no way in to a write, so the bar that starts one goes too. */}
          {canEdit && (
            <CaptureBar
              placeholder={currentIdea ? `Add inside ${currentIdea.title}…` : 'Add an idea…'}
              onQuickAdd={handleQuickAdd}
              onOpenComposer={handleOpenComposer}
            />
          )}

          {/* Directly under the bar that opened it: Tab is a continuation of
              typing, so the details unfold where the typing was, not somewhere
              the eye has to go find. Editors only, like the bar — there is no
              second way in, so nothing is left listening for an Escape that
              will never come. Parent choices are every live idea on the trip:
              the composer is the one place an idea can be filed somewhere
              other than the level on screen.

              This is the composer's home, not its only address: when a row's
              "Add an idea inside" moves it into that card, `composer.at` names
              the host and this instance stands down. One composer on the
              board, and the state says which one it is. */}
          {canEdit && (
            <IdeaComposer
              open={composer.open && composer.at === null}
              initialTitle={composer.initialTitle}
              initialParentIds={currentId !== null ? [currentId] : []}
              parentChoices={allIdeas}
              allIdeas={allIdeas}
              onSubmit={handleComposerSubmit}
              onCancel={closeComposer}
            />
          )}

          <FilterBar
            filters={filters}
            onChange={setFilters}
            groupMode={groupMode}
            onGroupModeChange={setGroupMode}
            visibleCount={visibleIdeas.length}
            totalCount={levelIdeas.length}
            mapOpen={mapOpen}
            onToggleMap={toggleMap}
            selectMode={selectMode}
            onSelectModeChange={setSelecting}
            countKnown={countKnown}
          />

          {/* The scope line: where in the tree the list below is standing.
              At root it is a plain heading; drilled, the current idea's own
              title leads, then the way back, then its two facts (what is
              inside it, how the votes stand). Clicking any crumb truncates
              the path to it. */}
          <nav className={styles.breadcrumbs} aria-label="Idea path">
            {currentIdea === undefined ? (
              <h2 className={styles.crumbHere}>All ideas</h2>
            ) : (
              <>
                {/* Where you are comes FIRST, per the redesign: the heading
                    leads the row, and the way back trails it — root, then each
                    ancestor — as the smaller fact it is. */}
                <h2 className={styles.crumbHere}>{currentIdea.title}</h2>
                <button type="button" className={styles.crumbBack} onClick={() => setPath([])}>
                  All ideas <span aria-hidden="true">›</span>
                </button>
                {path.slice(0, -1).map((id, index) => (
                  <button
                    key={id}
                    type="button"
                    className={styles.crumbBack}
                    onClick={() => setPath(path.slice(0, index + 1))}
                  >
                    {ideaById.get(id)?.title} <span aria-hidden="true">›</span>
                  </button>
                ))}
                {currentInsideCount > 0 && (
                  <span className={styles.insidePill}>{currentInsideCount} inside</span>
                )}
                {/* The tally alone — the crumb already names the idea, so no
                    category word here. Thumb by sign, number as written:
                    negatives carry their own minus. Zero draws no pill. */}
                {currentIdea.vote_tally.total !== 0 && (
                  <span className={styles.votePill}>
                    {currentIdea.vote_tally.total > 0 ? (
                      <ThumbsUp size={14} strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <ThumbsDown size={14} strokeWidth={2} aria-hidden="true" />
                    )}
                    {currentIdea.vote_tally.total}
                  </span>
                )}
              </>
            )}
          </nav>

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
            ) : visibleIdeas.length === 0 ? (
              // Two different kinds of nothing, and they must not share a
              // sentence: a level the filters emptied still holds ideas (say
              // where the way back is), while a drilled level that never had
              // any is an invitation to put the first one there.
              <p className={styles.noneInView}>
                {levelIdeas.length === 0 && currentIdea !== undefined
                  ? `Nothing inside yet. Type above — it lands inside ${currentIdea.title}.`
                  : 'Nothing matches those filters. Nothing is gone — widen them and it comes back.'}
              </p>
            ) : (
              <IdeaList
                entries={visibleIdeas}
                groupMode={groupMode}
                bundles={bundles}
                members={members}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onToast={(message) => show(message, 'success')}
                canEdit={canEdit}
                insideCounts={insideCounts}
                otherParents={otherParents}
                allIdeas={allIdeas}
                onDrill={drillInto}
                expandedIds={expandedIds}
                onToggleExpand={(id) => {
                  const closing = expandedIds.has(id);
                  setExpandedIds((previous) => {
                    const next = new Set(previous);
                    if (closing) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                  // Opening a row makes it the focused one; closing the
                  // focused row leaves nothing focused rather than promoting
                  // some other open row nobody pointed at.
                  if (closing) setFocusedId((current) => (current === id ? null : current));
                  else setFocusedId(id);
                }}
                focusedId={focusedId}
                onFocusRow={setFocusedId}
                // A closed composer stands nowhere: `composer.at` survives no
                // longer than the composer does, but reading it while shut
                // would still tell one row it is the host of a card that is
                // not there.
                composerAt={composer.open ? composer.at : null}
                onOpenComposerInside={openComposerInside}
                onComposerSubmit={handleComposerSubmit}
                onComposerCancel={closeComposer}
              />
            )}
          </QueryGate>

          <SetAsideSection
            entries={archivedIdeas}
            onRestore={(id) => restoreEntry.mutate(id, { onSuccess: () => show('Picked back up.', 'success') })}
            canEdit={canEdit}
          />
        </section>

        <div className={plansCollapsed ? `${styles.plans} ${styles.plansCollapsed}` : styles.plans}>
          <BundlePanel
            tripId={trip.id}
            bundles={bundles}
            archivedBundles={archivedBundles}
            members={members}
            query={bundlesQuery}
            onOpen={openIdeaFromPlan}
            onToast={(message) => show(message, 'success')}
            collapsed={plansCollapsed}
            onToggleCollapsed={togglePlansCollapsed}
          />
        </div>
      </div>

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
