import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../design/components/core/Button';
import { EmptyState } from '../components/EmptyState';
import { QueryGate } from '../components/QueryGate';
import { Row, Stack } from '../components/layout/Stack';
import { useToast } from '../components/Toast';
import { useEntries } from '../api';
import type { Entry } from '../api/types';
import { isWithinBounds } from '../features/map/bounds';
import { MapView } from '../features/map/MapView';
import { entriesWithCoordinates, entryToPin } from '../features/map/pins';
import type { Bounds } from '../features/map/types';
import { LibraryFilterBar } from '../features/library/LibraryFilterBar';
import { LibraryRow } from '../features/library/LibraryRow';
import { QuickAdd } from '../features/library/QuickAdd';
import { TakeSomewhereModal } from '../features/library/TakeSomewhereModal';
import { EMPTY_LIBRARY_FILTERS, applyLibraryFilters } from '../features/library/libraryFilters';
import type { LibraryFilters } from '../features/library/libraryFilters';
import styles from './Library.module.css';

/**
 * /library — collection mode, the brief's inspiration->trip flow. A
 * top-level route (not under TripLayout), so it draws its own heading —
 * see TripsList.tsx for the same pattern.
 *
 * Split view: list and map stay in sync both ways — hovering a row
 * highlights its pin (via `hoveredId`/`pinClickedId` -> MapView's
 * `selectedId`), and panning the map narrows the list (via `mapBounds`).
 * Only the map side ever imports features/map's Leaflet-backed pieces —
 * this route itself only knows the provider-agnostic seam.
 */
export function Library() {
  const { show } = useToast();
  const navigate = useNavigate();

  const ideasQuery = useEntries({ unassigned: true, kind: 'idea' });

  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_LIBRARY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [pinClickedId, setPinClickedId] = useState<number | null>(null);
  const [mapBounds, setMapBounds] = useState<Bounds | null>(null);
  const [takingSomewhere, setTakingSomewhere] = useState(false);
  const lastSelectedId = useRef<number | null>(null);

  const allIdeas = useMemo(() => (ideasQuery.data ?? []).filter((e) => !e.archived_at), [ideasQuery.data]);
  const categoryFiltered = useMemo(() => applyLibraryFilters(allIdeas, filters), [allIdeas, filters]);

  // Panning the map narrows the list — but only among entries that have a
  // place at all. An idea with no coordinates can't be spatially filtered,
  // so it always stays listed regardless of where the map is looking.
  const spatiallyVisible = useMemo(() => {
    if (!mapBounds) return categoryFiltered;
    return categoryFiltered.filter(
      (entry) => entry.lat === null || entry.lng === null || isWithinBounds({ id: entry.id, lat: entry.lat, lng: entry.lng }, mapBounds),
    );
  }, [categoryFiltered, mapBounds]);

  const pins = useMemo(
    () => entriesWithCoordinates(categoryFiltered).map((entry) => entryToPin(entry as Entry & { lat: number; lng: number })),
    [categoryFiltered],
  );
  const orderedIds = useMemo(() => spatiallyVisible.map((entry) => entry.id), [spatiallyVisible]);

  function onToggleSelect(id: number, shiftKey: boolean) {
    setSelectedIds((prev) => {
      if (shiftKey && lastSelectedId.current !== null) {
        const startIndex = orderedIds.indexOf(lastSelectedId.current);
        const endIndex = orderedIds.indexOf(id);
        if (startIndex !== -1 && endIndex !== -1) {
          const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          const range = orderedIds.slice(from, to + 1);
          return Array.from(new Set([...prev, ...range]));
        }
      }
      lastSelectedId.current = id;
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }

  /** "Select by map region" — the whole reason panning narrows the list first. */
  function selectAllShown() {
    setSelectedIds((prev) => Array.from(new Set([...prev, ...orderedIds])));
  }

  /** Zooming a cluster reads as "start a trip from these nine" — the click both zooms and selects. */
  function handleClusterSelect(ids: number[]) {
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    show(ids.length === 1 ? 'Selected 1 idea near here.' : `Selected ${ids.length} ideas near here.`, 'success');
  }

  const selectedCount = selectedIds.length;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.pageTitle}>Library</h1>
        <p className={styles.pageDescription}>Kept, not yet in a trip — inspiration waiting for a use.</p>
      </div>

      <QuickAdd />

      <QueryGate
        query={ideasQuery}
        loadingLabel="Finding what you've kept"
        errorMessage="Your library didn't load. Nothing is lost — everything you've kept is still saved."
      >
        {allIdeas.length === 0 ? (
          <EmptyState message="Nothing kept yet. Saving something is how a trip starts." />
        ) : (
          <>
            <LibraryFilterBar
              filters={filters}
              onChange={setFilters}
              visibleCount={spatiallyVisible.length}
              totalCount={allIdeas.length}
            />

            <div className={styles.selectionBar}>
              <p className={styles.selectionCount}>
                {selectedCount === 0 ? 'Nothing selected yet.' : `${selectedCount} selected`}
              </p>
              <Row gap={2} wrap>
                {orderedIds.length > 0 && (
                  <Button variant="quiet" onClick={selectAllShown}>
                    Select all shown
                  </Button>
                )}
                {selectedCount > 0 && (
                  <Button variant="quiet" onClick={() => setSelectedIds([])}>
                    Clear selection
                  </Button>
                )}
                <Button disabled={selectedCount === 0} onClick={() => setTakingSomewhere(true)}>
                  Take these somewhere
                </Button>
              </Row>
            </div>

            <div className={styles.split}>
              <div className={styles.list}>
                {spatiallyVisible.length === 0 ? (
                  <p className={styles.noneInView}>Nothing here. Pan the map, or widen your filters.</p>
                ) : (
                  <Stack gap={3}>
                    {spatiallyVisible.map((entry) => (
                      <LibraryRow
                        key={entry.id}
                        entry={entry}
                        selected={selectedIds.includes(entry.id)}
                        onToggleSelect={onToggleSelect}
                        onHoverChange={setHoveredId}
                      />
                    ))}
                  </Stack>
                )}
              </div>

              <div className={styles.mapCell}>
                <MapView
                  pins={pins}
                  selectedId={hoveredId ?? pinClickedId}
                  onSelectPin={setPinClickedId}
                  onSelectCluster={handleClusterSelect}
                  onBoundsChange={setMapBounds}
                  fitToPins
                  aria-label="Map of everything you've kept"
                />
              </div>
            </div>
          </>
        )}
      </QueryGate>

      <TakeSomewhereModal
        open={takingSomewhere}
        onClose={() => setTakingSomewhere(false)}
        selectedCount={selectedCount}
        selectedIds={selectedIds}
        onDone={(tripId) => {
          setTakingSomewhere(false);
          setSelectedIds([]);
          navigate(`/trips/${tripId}`);
        }}
      />
    </div>
  );
}
