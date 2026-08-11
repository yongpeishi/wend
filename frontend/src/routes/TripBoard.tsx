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
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { EntryRow } from '../components/EntryRow';
import { Card } from '../components/layout/Card';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useEntries, useRestoreEntry } from '../api';
import type { Entry } from '../api/types';
import { FilterBar } from '../features/board/FilterBar';
import { IdeaList } from '../features/board/IdeaList';
import { NewIdeaModal } from '../features/board/NewIdeaModal';
import { BulkBar } from '../features/board/BulkBar';
import { BundlePanel } from '../features/board/BundlePanel';
import { SetAsideSection } from '../features/board/SetAsideSection';
import { useBundleMembers } from '../features/board/useBundleMembers';
import { useLinkMutations } from '../features/board/useLinkMutations';
import { useCreateBundleWithIdea } from '../features/board/useCreateBundle';
import type { BundleDropData } from '../features/board/useCreateBundle';
import { EMPTY_FILTERS, applyFilters, groupEntries } from '../features/board/filters';
import type { GroupMode, IdeaFilters } from '../features/board/filters';
import { EntryDetailDrawer } from './EntryDetail';
import styles from './TripBoard.module.css';

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
 */
export function TripBoard() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const { show } = useToast();

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

  const restoreEntry = useRestoreEntry();
  const { addLink } = useLinkMutations();
  const createBundleWithIdea = useCreateBundleWithIdea();

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

  // Shift-select ranges follow the order the list actually renders in, so the
  // range a user sees between two clicks is the range they get.
  const orderedVisibleIds = useMemo(
    () => groupEntries(visibleIdeas, groupMode).flatMap((group) => group.entries.map((e) => e.id)),
    [visibleIdeas, groupMode],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

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

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { entryId: number; title: string } | undefined;
    if (data) setActiveDrag(data);
  }

  /**
   * Two kinds of drop target share this handler: an existing bundle card, and
   * the new-bundle box at the top of the rail. Both are distinguished by their
   * droppable data rather than by id parsing — see useCreateBundle.ts.
   *
   * Dropping onto a bundle COPIES the link and never removes the old one, so
   * an idea can belong to several bundles at once. Dropping onto the new-bundle
   * box creates the bundle and links the idea in one gesture; the create-then-
   * link sequencing lives in the hook, because the link needs the id the POST
   * returns.
   */
  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const entryData = active.data.current as { entryId: number; title: string } | undefined;
    const overData = over.data.current as BundleDropData | undefined;
    if (!entryData || !overData) return;

    if (overData.newBundle) {
      createBundleWithIdea.mutate(
        { tripId: trip.id, entryId: entryData.entryId, ideaTitle: entryData.title },
        {
          onSuccess: (bundle) =>
            show(`Started ${bundle.title} with ${entryData.title}. Rename it any time.`, 'success'),
          onError: () => show("That didn't save. It's still here — try again.", 'error'),
        },
      );
      return;
    }

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
          <NewIdeaModal open={newIdeaOpen} onClose={closeNewIdea} parentId={trip.id} />

          <FilterBar
            filters={filters}
            onChange={setFilters}
            groupMode={groupMode}
            onGroupModeChange={setGroupMode}
            onNewIdea={openNewIdea}
            visibleCount={visibleIdeas.length}
            totalCount={allIdeas.length}
          />

          <BulkBar
            selectedIds={selectedIds}
            bundles={bundles}
            onClear={() => setSelectedIds([])}
            onToast={(message) => show(message, 'success')}
          />

          {ideasQuery.isLoading ? (
            <Spinner label="Finding your ideas" />
          ) : allIdeas.length === 0 ? (
            <EmptyState message="This one's still a daydream. Add the first thing you'd like to do." />
          ) : (
            <IdeaList
              entries={visibleIdeas}
              groupMode={groupMode}
              bundles={bundles}
              members={members}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onEdit={setEditingId}
              onToast={(message) => show(message, 'success')}
            />
          )}

          <SetAsideSection
            entries={archivedIdeas}
            onRestore={(id) => restoreEntry.mutate(id, { onSuccess: () => show('Picked back up.', 'success') })}
          />
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
