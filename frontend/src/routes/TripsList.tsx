import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../design/components/core/Button';
import { EntryRow } from '../components/EntryRow';
import { EmptyState } from '../components/EmptyState';
import { QueryGate } from '../components/QueryGate';
import { useArchiveEntry, useEntries, useRestoreEntry } from '../api/entries';
import { canDelete } from '../auth/tripRole';
import { CATEGORY_LABELS } from '../features/board/filters';
import { NewTripModal } from '../features/trips/NewTripModal';
import { TripCard } from '../features/trips/TripCard';
import styles from './TripsList.module.css';

/**
 * `/` — every trip you're carrying, and the ideas you've kept that aren't in one
 * yet.
 *
 * Trips are fetched with `include_archived` and split here rather than in two
 * queries: "Saved for later" is the same list read the other way round, and one
 * request keeps the two halves from ever disagreeing mid-flight.
 */
export function TripsList() {
  const navigate = useNavigate();

  const tripsQuery = useEntries({ kind: 'trip', include_archived: true });
  const libraryQuery = useEntries({ unassigned: true, kind: 'idea' });

  const archiveTrip = useArchiveEntry();
  const restoreTrip = useRestoreEntry();

  const [starting, setStarting] = useState(false);

  const allTrips = tripsQuery.data ?? [];
  const trips = allTrips.filter((t) => !t.archived_at);
  const saved = allTrips.filter((t) => t.archived_at);
  const library = (libraryQuery.data ?? []).filter((e) => !e.archived_at).slice(0, 6);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <p className={styles.eyebrow}>Your trips</p>
          <h1 className={styles.pageTitle}>Where next</h1>
        </div>
        <Button className={styles.newTrip} onClick={() => setStarting(true)}>
          + New trip
        </Button>
      </div>

      <p className={styles.intro}>
        Nothing here is decided. Trips you set aside keep their ideas, and you can lift one out into a
        trip of its own whenever you like.
      </p>

      <NewTripModal
        open={starting}
        onClose={() => setStarting(false)}
        onCreated={(trip) => {
          setStarting(false);
          navigate(`/trips/${trip.id}`);
        }}
      />

      <QueryGate
        query={tripsQuery}
        loadingLabel="Finding your trips"
        errorMessage="Your trips didn't load. Nothing is lost — they're all still here."
      >
        {trips.length === 0 ? (
          <EmptyState message="No trips yet. A trip can start as one word — a country, a season, a craving." />
        ) : (
          <ul className={styles.grid}>
            {trips.map((trip) => (
              <li key={trip.id} className={styles.gridItem}>
                <TripCard trip={trip} onArchive={() => archiveTrip.mutate(trip.id)} />
              </li>
            ))}
          </ul>
        )}
      </QueryGate>

      {saved.length > 0 && (
        <section className={styles.section} aria-labelledby="saved-heading">
          <h2 id="saved-heading" className={styles.sectionLabel}>
            Saved for later
          </h2>
          <ul className={styles.savedList}>
            {saved.map((trip) => (
              <li key={trip.id} className={styles.savedRow}>
                <div className={styles.savedText}>
                  <span className={styles.savedTitle}>{trip.title}</span>
                  {trip.description && <span className={styles.savedNote}>{trip.description}</span>}
                </div>
                {/* Setting aside and bringing back are the same decision read
                    from either end, so they answer to the same capability. A
                    member on a trip somebody else set aside still sees it here
                    — they simply have no button. */}
                {canDelete(trip.my_role ?? null) && (
                  <button
                    type="button"
                    className={styles.bringBack}
                    onClick={() => restoreTrip.mutate(trip.id)}
                  >
                    Bring back
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section} aria-labelledby="library-heading">
        <div className={styles.libraryHead}>
          <h2 id="library-heading" className={styles.sectionLabel}>
            Kept, not yet in a trip
          </h2>
          <Link to="/library" className={styles.seeAll}>
            See all
          </Link>
        </div>

        <QueryGate
          query={libraryQuery}
          loadingLabel="Finding what you've kept"
          errorMessage="What you've kept didn't load. Nothing is lost — it's all still saved."
        >
          {library.length === 0 ? (
            <p className={styles.libraryEmpty}>
              Nothing kept yet. Saving something is how a trip starts.
            </p>
          ) : (
            <ul className={styles.libraryList}>
              {library.map((entry) => (
                <li key={entry.id}>
                  <EntryRow
                    title={entry.title}
                    metadata={entry.category ? [CATEGORY_LABELS[entry.category]] : []}
                    kept
                    onSelect={() => navigate(`/entries/${entry.id}`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </QueryGate>
      </section>
    </div>
  );
}
