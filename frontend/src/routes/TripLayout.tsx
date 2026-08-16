import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEntry } from '../api/entries';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { formatTripDates } from '../lib/formatDates';
import styles from './TripLayout.module.css';

const TAB_KEYS = ['board', 'itinerary', 'checklist', 'schedule', 'map'];

/**
 * Which tab the current URL is on. `/trips/:id` itself is the board. The tab
 * list itself now lives in the sidebar (AppLayout); this survives only because
 * the schedule decides the surface the whole shell is painted on.
 */
function tabFromPath(pathname: string): string {
  const tail = pathname.split('/')[3];
  return TAB_KEYS.includes(tail as string) ? (tail as string) : 'board';
}

/**
 * Shared shell for every trip surface: the trip's title and dates, and the
 * surface they sit on. The schedule inverts to the dark outdoor-reading
 * surface; every other tab sits on paper.
 *
 * Navigation between the trip's views is deliberately not here — it is in the
 * sidebar, where it stays put while the page changes underneath it.
 */
export function TripLayout() {
  const { id } = useParams();
  const tripId = id ? Number(id) : undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const { data, isLoading, isError } = useEntry(tripId);

  const tab = tabFromPath(location.pathname);
  const onDark = tab === 'schedule';
  const trip = data?.entry;

  if (isLoading) {
    return (
      <div className={styles.wrap}>
        <Spinner label="Finding your trip" />
      </div>
    );
  }

  if (isError || !trip) {
    return (
      <div className={styles.wrap}>
        <PageHeader
          title="That trip isn't here"
          description="It may have been set aside. Everything you kept is still safe."
          onBack={() => navigate('/')}
        />
      </div>
    );
  }

  const dates = formatTripDates(trip.starts_on, trip.ends_on);

  return (
    <div className={onDark ? styles.onDark : undefined}>
      <div className={styles.wrap}>
        <div className={styles.head}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{trip.title}</h1>
            {dates ? (
              <p className={styles.dates}>{dates}</p>
            ) : (
              <p className={styles.noDates}>No dates yet</p>
            )}
          </div>
        </div>

        <Outlet context={{ trip }} />
      </div>
    </div>
  );
}
