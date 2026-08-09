import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button } from '../design/components/core/Button';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useCreateEntry, useEntries } from '../api';
import type { Entry } from '../api/types';
import { AddPlaceForm } from '../features/map/AddPlaceForm';
import { MapFilterBar } from '../features/map/MapFilterBar';
import { EMPTY_MAP_FILTERS, applyMapFilters } from '../features/map/mapFilters';
import type { MapFilters } from '../features/map/mapFilters';
import { MapView } from '../features/map/MapView';
import { PinPopover } from '../features/map/PinPopover';
import { entriesWithCoordinates, entryToPin } from '../features/map/pins';
import styles from './TripMap.module.css';

/**
 * /trips/:id/map — pins for every located idea in the trip. TripLayout
 * already draws the header, dates and tab bar; this owns the body only.
 *
 * Talks to the map only through features/map's provider-agnostic seam
 * (<MapView>, <PlaceSearch> via <AddPlaceForm>) — nothing here imports
 * `leaflet` directly, so swapping the renderer later doesn't touch this file.
 */
export function TripMap() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const { show } = useToast();

  const entriesQuery = useEntries({ trip_id: trip.id, kind: 'idea' });
  const createEntry = useCreateEntry();

  const [filters, setFilters] = useState<MapFilters>(EMPTY_MAP_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [clickedLocation, setClickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);

  const allLocated = useMemo(() => entriesWithCoordinates(entriesQuery.data ?? []), [entriesQuery.data]);
  const visible = useMemo(() => applyMapFilters(allLocated, filters), [allLocated, filters]);
  const pins = useMemo(
    () => visible.map((entry) => entryToPin(entry as Entry & { lat: number; lng: number })),
    [visible],
  );
  const visibleById = useMemo(() => new Map(visible.map((entry) => [entry.id, entry])), [visible]);

  function openAddForm(location?: { lat: number; lng: number }) {
    setAdding(true);
    setSelectedId(null);
    if (location) {
      setClickedLocation(location);
      setPendingLocation(location);
    }
  }

  function closeAddForm() {
    setAdding(false);
    setClickedLocation(null);
    setPendingLocation(null);
  }

  function handleSave(data: { title: string; lat: number; lng: number; location_name: string | null }) {
    createEntry.mutate(
      {
        entry: { kind: 'idea', title: data.title, lat: data.lat, lng: data.lng, location_name: data.location_name },
        parent_id: trip.id,
      },
      {
        onSuccess: () => {
          show('Kept, with a place attached.', 'success');
          closeAddForm();
        },
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  const loading = entriesQuery.isLoading;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <MapFilterBar filters={filters} onChange={setFilters} visibleCount={pins.length} totalCount={allLocated.length} />
        {!adding && (
          <Button variant="secondary" onClick={() => openAddForm()}>
            Add a place
          </Button>
        )}
      </div>

      {adding && (
        <AddPlaceForm
          clickedLocation={clickedLocation}
          onSave={handleSave}
          onCancel={closeAddForm}
          onChosenLocationChange={setPendingLocation}
          saving={createEntry.isPending}
        />
      )}

      {loading ? (
        <Spinner label="Finding your places" />
      ) : allLocated.length === 0 ? (
        <EmptyState message="Nothing on the map yet. Give an idea a place and it will show up here." />
      ) : (
        <div className={styles.mapWrap}>
          <MapView
            pins={pins}
            selectedId={selectedId}
            onSelectPin={setSelectedId}
            onMapClick={(lat, lng) => openAddForm({ lat, lng })}
            pendingLocation={pendingLocation}
            fitToPins
            renderPopup={(id) => {
              const entry = visibleById.get(id);
              return entry ? <PinPopover entry={entry} /> : null;
            }}
            aria-label={`Map of ${trip.title}`}
          />
        </div>
      )}
    </div>
  );
}
