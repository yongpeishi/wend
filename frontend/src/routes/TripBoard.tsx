import { useMemo, useRef, useState } from 'react';
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
import { Input } from '../design/components/core/Input';
import { EntryRow } from '../components/EntryRow';
import { Card } from '../components/layout/Card';
import { Stack } from '../components/layout/Stack';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useCreateEntry, useEntries, useRestoreEntry } from '../api';
import type { Entry } from '../api/types';
import { EntryTree } from '../features/board/EntryTree';
import { FilterBar } from '../features/board/FilterBar';
import { IdeaRow } from '../features/board/IdeaRow';
import { BulkBar } from '../features/board/BulkBar';
import { BundleCard } from '../features/board/BundleCard';
import { CompareBundles } from '../features/board/CompareBundles';
import { SetAsideSection } from '../features/board/SetAsideSection';
import { useBundleMembers } from '../features/board/useBundleMembers';
import { useLinkMutations } from '../features/board/useLinkMutations';
import { EMPTY_FILTERS, applyFilters, groupByCategory } from '../features/board/filters';
import type { IdeaFilters } from '../features/board/filters';
import styles from './TripBoard.module.css';

/**
 * /trips/:id — the planning board. Three columns: tree (nav), ideas (the
 * working surface), bundles (grouping). Renders inside TripLayout, which
 * already draws the trip header, dates and TrailNav — this only owns the
 * body below the tab bar.
 */
export function TripBoard() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const { show } = useToast();

  const [scope, setScope] = useState<{ id: number; title: string }>({ id: trip.id, title: trip.title });
  const [filters, setFilters] = useState<IdeaFilters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newIdeaTitle, setNewIdeaTitle] = useState('');
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [activeDrag, setActiveDrag] = useState<{ entryId: number; title: string } | null>(null);
  const lastSelectedId = useRef<number | null>(null);

  const createEntry = useCreateEntry();
  const restoreEntry = useRestoreEntry();
  const { addLink } = useLinkMutations();

  const ideasQuery = useEntries({ trip_id: scope.id, kind: 'idea', include_archived: true });
  const bundlesQuery = useEntries({ trip_id: trip.id, kind: 'bundle', include_archived: true });

  const allIdeas = useMemo(() => (ideasQuery.data ?? []).filter((e) => !e.archived_at), [ideasQuery.data]);
  const archivedIdeas = useMemo(() => (ideasQuery.data ?? []).filter((e) => e.archived_at), [ideasQuery.data]);
  const bundles = useMemo(() => (bundlesQuery.data ?? []).filter((e) => !e.archived_at), [bundlesQuery.data]);
  const archivedBundles = useMemo(() => (bundlesQuery.data ?? []).filter((e) => e.archived_at), [bundlesQuery.data]);

  const members = useBundleMembers(bundles);

  const visibleIdeas = useMemo(() => applyFilters(allIdeas, filters), [allIdeas, filters]);
  const groups = useMemo(() => groupByCategory(visibleIdeas), [visibleIdeas]);
  const orderedVisibleIds = useMemo(() => groups.flatMap((g) => g.entries.map((e) => e.id)), [groups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function handleAddIdea() {
    const title = newIdeaTitle.trim();
    if (!title) return;
    createEntry.mutate(
      { entry: { kind: 'idea', title }, parent_id: scope.id },
      {
        onSuccess: () => setNewIdeaTitle(''),
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

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

  function onToggleCompare(id: number) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1] as number, id];
      return [...prev, id];
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { entryId: number; title: string } | undefined;
    if (data) setActiveDrag(data);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const entryData = active.data.current as { entryId: number; title: string } | undefined;
    const bundleData = over.data.current as { bundleId: number; title: string } | undefined;
    if (!entryData || !bundleData) return;
    addLink.mutate(
      { parentId: bundleData.bundleId, childId: entryData.entryId },
      {
        onSuccess: () => show(`Added ${entryData.title} to ${bundleData.title}.`, 'success'),
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  const compareBundleA = compareIds[0] !== undefined ? bundles.find((b) => b.id === compareIds[0]) : undefined;
  const compareBundleB = compareIds[1] !== undefined ? bundles.find((b) => b.id === compareIds[1]) : undefined;

  const loading = ideasQuery.isLoading || bundlesQuery.isLoading;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDrag(null)}>
      <div className={styles.grid}>
        <details className={styles.treeDisclosure} open>
          <summary className={styles.treeSummary}>Trip structure</summary>
          <EntryTree trip={trip} selectedId={scope.id} onSelect={(id, title) => setScope({ id, title })} />
        </details>

        <section className={styles.ideas} aria-label="Ideas">
          <Input
            placeholder="What else would you like to do?"
            hint="↵"
            value={newIdeaTitle}
            onChange={(e) => setNewIdeaTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddIdea();
            }}
            aria-label="What else would you like to do?"
          />

          {scope.id !== trip.id && (
            <p className={styles.scopeLine}>
              Scoped to <strong>{scope.title}</strong>.{' '}
              <button type="button" className={styles.showAll} onClick={() => setScope({ id: trip.id, title: trip.title })}>
                Show all
              </button>
            </p>
          )}

          <FilterBar filters={filters} onChange={setFilters} visibleCount={visibleIdeas.length} totalCount={allIdeas.length} />

          <BulkBar
            selectedIds={selectedIds}
            bundles={bundles}
            onClear={() => setSelectedIds([])}
            onToast={(message) => show(message, 'success')}
          />

          {loading ? (
            <Spinner label="Finding your ideas" />
          ) : allIdeas.length === 0 ? (
            <EmptyState message="This one's still a daydream. Add the first thing you'd like to do." />
          ) : (
            <Stack gap={12}>
              {groups.map((group) => (
                <Stack gap={3} key={group.key}>
                  <p className={styles.groupLabel}>{group.label}</p>
                  <Stack gap={3}>
                    {group.entries.map((entry) => (
                      <IdeaRow
                        key={entry.id}
                        entry={entry}
                        bundles={bundles}
                        members={members}
                        selected={selectedIds.includes(entry.id)}
                        onToggleSelect={onToggleSelect}
                        onToast={(message) => show(message, 'success')}
                      />
                    ))}
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}

          <SetAsideSection
            entries={archivedIdeas}
            onRestore={(id) => restoreEntry.mutate(id, { onSuccess: () => show('Picked back up.', 'success') })}
          />
        </section>

        <section className={styles.bundles} aria-label="Bundles">
          <p className={styles.groupLabel}>Bundles</p>
          {bundlesQuery.isLoading ? (
            <Spinner label="Finding your bundles" />
          ) : bundles.length === 0 ? (
            <p className={styles.emptyBundles}>
              No bundles yet. Add one from the drawer, or fork an idea into a group once you have one.
            </p>
          ) : (
            <Stack gap={4}>
              {bundles.map((bundle) => (
                <BundleCard
                  key={bundle.id}
                  bundle={bundle}
                  members={members.get(bundle.id) ?? []}
                  compareSelected={compareIds.includes(bundle.id)}
                  onToggleCompare={onToggleCompare}
                  onToast={(message) => show(message, 'success')}
                />
              ))}
            </Stack>
          )}
          <SetAsideSection
            entries={archivedBundles}
            onRestore={(id) => restoreEntry.mutate(id, { onSuccess: () => show('Picked back up.', 'success') })}
          />
        </section>
      </div>

      <DragOverlay>
        {activeDrag && <Card padding={2}><EntryRow title={activeDrag.title} kept={false} /></Card>}
      </DragOverlay>

      {compareBundleA && compareBundleB && (
        <CompareBundles
          bundleA={compareBundleA}
          bundleB={compareBundleB}
          membersA={members.get(compareBundleA.id) ?? []}
          membersB={members.get(compareBundleB.id) ?? []}
          onClose={() => setCompareIds([])}
        />
      )}
    </DndContext>
  );
}
