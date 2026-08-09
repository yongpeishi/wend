import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../design/components/core/Button';
import { Input } from '../design/components/core/Input';
import { Trail } from '../design/components/brand/Trail';
import type { TrailStopState } from '../design/components/brand/Trail';
import { Card } from '../components/layout/Card';
import { EntryRow } from '../components/EntryRow';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { useCreateEntry, useEntries } from '../api/entries';
import type { Entry } from '../api/types';
import { formatTripDates, joinMeta } from '../lib/formatDates';
import styles from './TripsList.module.css';

/**
 * How far along a trip is, shown as the trail. Deliberately forgiving: a trip
 * with nothing in it is still at the first stop, not "empty" or "incomplete".
 */
function tripStops(trip: Entry): TrailStopState[] {
  const hasIdeas = trip.children_count > 0;
  const hasDates = Boolean(trip.starts_on || trip.ends_on);
  if (hasIdeas && hasDates) return ['decided', 'decided', 'open'];
  if (hasIdeas) return ['decided', 'open', 'waiting'];
  return ['open', 'waiting', 'waiting'];
}

/** `nine places kept · two bundles` — plain words, never a progress percentage. */
function countLine(trip: Entry): string {
  const kept = trip.children_count;
  return joinMeta(
    kept === 1 ? '1 thing kept' : `${kept} things kept`,
    trip.todos_open_count > 0 ? `${trip.todos_open_count} to check off` : undefined,
  );
}

/** `/` — trips you're planning, and the ideas you've kept that aren't in one yet. */
export function TripsList() {
  const navigate = useNavigate();
  const { show } = useToast();

  const tripsQuery = useEntries({ kind: 'trip' });
  const libraryQuery = useEntries({ unassigned: true, kind: 'idea' });

  const [starting, setStarting] = useState(false);
  const [title, setTitle] = useState('');
  const createEntry = useCreateEntry();

  const trips = (tripsQuery.data ?? []).filter((t) => !t.archived_at);
  const library = (libraryQuery.data ?? []).filter((e) => !e.archived_at).slice(0, 6);

  function handleStart() {
    const name = title.trim();
    if (!name) return;
    createEntry.mutate(
      { entry: { kind: 'trip', title: name } },
      {
        onSuccess: (entry) => {
          setTitle('');
          setStarting(false);
          navigate(`/trips/${entry.id}`);
        },
        onError: () => show("That didn't save. It's still here — try again.", 'error'),
      },
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.pageTitle}>Where you&rsquo;re going</h1>
        {!starting && (
          <Button onClick={() => setStarting(true)}>Start something</Button>
        )}
      </div>

      {starting && (
        <div className={styles.startBox}>
          <Input
            placeholder="Where are you going?"
            hint="↵"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleStart();
              if (e.key === 'Escape') setStarting(false);
            }}
            aria-label="Where are you going?"
          />
          <p className={styles.startHint}>
            A trip can start as one word. Dates can come later, or never.
          </p>
        </div>
      )}

      {tripsQuery.isLoading ? (
        <Spinner label="Finding your trips" />
      ) : trips.length === 0 ? (
        <EmptyState message="No trips yet. A trip can start as one word — a country, a season, a craving." />
      ) : (
        <ul className={styles.grid}>
          {trips.map((trip) => {
            const dates = formatTripDates(trip.starts_on, trip.ends_on);
            return (
              <li key={trip.id}>
                <Link to={`/trips/${trip.id}`} className={styles.cardLink}>
                  <Card padding={6} className={styles.card}>
                    <h2 className={styles.tripTitle}>{trip.title}</h2>
                    {dates ? (
                      <p className={styles.dates}>{dates}</p>
                    ) : (
                      <p className={styles.noDates}>No dates yet</p>
                    )}
                    <p className={styles.counts}>{countLine(trip)}</p>
                    <Trail stops={tripStops(trip)} height={38} aria-hidden="true" />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <section className={styles.librarySection} aria-labelledby="library-heading">
        <div className={styles.libraryHead}>
          <h2 id="library-heading" className={styles.sectionLabel}>
            Kept, not yet in a trip
          </h2>
          <Link to="/library" className={styles.seeAll}>
            See all
          </Link>
        </div>

        {libraryQuery.isLoading ? (
          <Spinner label="Finding what you've kept" />
        ) : library.length === 0 ? (
          <p className={styles.libraryEmpty}>
            Nothing kept yet. Saving something is how a trip starts.
          </p>
        ) : (
          <ul className={styles.libraryList}>
            {library.map((entry) => (
              <li key={entry.id}>
                <EntryRow
                  title={entry.title}
                  metadata={[entry.category, entry.location_name].filter(Boolean) as string[]}
                  kept
                  onSelect={() => navigate(`/entries/${entry.id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
