import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button } from '../design/components/core/Button';
import { useCanEdit } from '../auth/TripRoleContext';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { TabBar } from '../components/TabBar';
import { useEntries } from '../api/entries';
import { useNearby } from '../api/nearby';
import { useSchedule } from '../api/schedule';
import type { Entry } from '../api/types';
import { DayColumn } from '../features/schedule/DayColumn';
import { PlaceAtModal } from '../features/schedule/PlaceAtModal';
import { UnscheduledTray } from '../features/schedule/UnscheduledTray';
import { useGeolocation } from '../features/schedule/useGeolocation';
import { daysForTrip, itemsForDay, unplacedIdeas } from '../features/schedule/scheduleModel';
import { formatDistance, joinMeta } from '../lib/formatDates';
import styles from './TripSchedule.module.css';

/**
 * /trips/:id/schedule — the hourly plan, and the one dark surface in the
 * product: it inverts for outdoor reading. TripLayout already paints the dark
 * background and draws the header, so this owns the body only.
 *
 * Mobile-first throughout: this is read one-handed, walking, in bright sun.
 */
export function TripSchedule() {
  const { trip } = useOutletContext<{ trip: Entry }>();
  const canEdit = useCanEdit();

  const scheduleQuery = useSchedule(trip.id);
  const entriesQuery = useEntries({ trip_id: trip.id });

  const items = useMemo(() => scheduleQuery.data ?? [], [scheduleQuery.data]);
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);

  const days = useMemo(
    () => daysForTrip(trip, items.map((i) => i.day)),
    [trip, items],
  );
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const day = activeDay ?? days[0]?.day ?? '';

  const [placing, setPlacing] = useState<Entry | null>(null);
  const [showNearby, setShowNearby] = useState(false);
  const geo = useGeolocation();

  // Fall back to the trip's own centre of gravity when the browser won't say
  // where we are — a denied permission should not close the door on the feature.
  const tripCentre = useMemo(() => {
    const located = entries.filter((e) => e.lat != null && e.lng != null);
    if (located.length === 0) return null;
    const lat = located.reduce((sum, e) => sum + Number(e.lat), 0) / located.length;
    const lng = located.reduce((sum, e) => sum + Number(e.lng), 0) / located.length;
    return { lat, lng };
  }, [entries]);

  const origin = geo.coords ?? (geo.denied ? tripCentre : null);
  const nearbyQuery = useNearby(
    showNearby && origin ? trip.id : undefined,
    { lat: origin?.lat ?? 0, lng: origin?.lng ?? 0, radius_km: 2, exclude_scheduled: true },
  );

  const dayItems = useMemo(() => itemsForDay(items, day), [items, day]);
  const unplaced = useMemo(() => unplacedIdeas(entries), [entries]);

  const loading = scheduleQuery.isLoading || entriesQuery.isLoading;

  function askWhatsAround() {
    setShowNearby(true);
    geo.request();
  }

  return (
    <div className={styles.wrap}>
      {days.length > 1 && (
        <div className={styles.days}>
          <TabBar
            tabs={days.map((d) => ({ key: d.day, label: d.label }))}
            activeKey={day}
            aria-label="Days"
            onChange={setActiveDay}
          />
        </div>
      )}

      {loading ? (
        <Spinner label="Finding your plan" onDark />
      ) : dayItems.length === 0 ? (
        <EmptyState
          message={
            canEdit
              ? 'Nothing placed yet. Drag something over from your ideas.'
              : 'Nothing placed on this day yet.'
          }
          onDark
        />
      ) : (
        <DayColumn items={dayItems} entries={entries} canEdit={canEdit} />
      )}

      <div className={styles.nearby}>
        <Button variant="onDark" onClick={askWhatsAround}>
          What&rsquo;s around here?
        </Button>

        {showNearby && (
          <div className={styles.nearbyPanel}>
            {geo.loading && <Spinner label="Working out where you are" onDark />}

            {geo.denied && !tripCentre && (
              <p className={styles.nearbyNote}>
                Your browser won&rsquo;t share your location, and nothing in this trip has
                a place yet. Add a location to an idea and this will work.
              </p>
            )}

            {geo.denied && tripCentre && (
              <p className={styles.nearbyNote}>
                Your browser won&rsquo;t share your location, so this is measured from the
                middle of your trip instead.
              </p>
            )}

            {origin && nearbyQuery.isLoading && <Spinner label="Looking around" onDark />}

            {origin && nearbyQuery.data && nearbyQuery.data.length === 0 && (
              <p className={styles.nearbyNote}>
                Nothing unplaced within a short walk. A good moment for a detour.
              </p>
            )}

            {origin && nearbyQuery.data && nearbyQuery.data.length > 0 && (
              <ul className={styles.nearbyList}>
                {nearbyQuery.data.map((entry) => (
                  <li key={entry.id} className={styles.nearbyItem}>
                    <span className={styles.nearbyTitle}>{entry.title}</span>
                    <span className={styles.nearbyMeta}>
                      {joinMeta(
                        entry.category ?? undefined,
                        entry.distance_km != null ? formatDistance(entry.distance_km) : undefined,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <UnscheduledTray entries={unplaced} onPlaceAt={setPlacing} canEdit={canEdit} />

      {/* Only reachable from the tray's "Place at…", which a viewer does not
          have — mounted conditionally so there is no second way in. */}
      {canEdit && placing && (
        <PlaceAtModal
          tripId={trip.id}
          entry={placing}
          defaultDay={day}
          days={days}
          onClose={() => setPlacing(null)}
        />
      )}
    </div>
  );
}
