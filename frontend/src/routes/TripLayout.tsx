import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEntry } from '../api/entries';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { TabBar } from '../components/TabBar';
import { TrailNav, type TrailStep } from '../components/TrailNav';
import { formatTripDates } from '../lib/formatDates';
import styles from './TripLayout.module.css';

const TABS = [
  { key: 'board', label: 'Ideas' },
  { key: 'map', label: 'Map' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'checklist', label: 'Checklist' },
];

/** Which tab the current URL is on. `/trips/:id` itself is the board. */
function tabFromPath(pathname: string): string {
  const tail = pathname.split('/')[3];
  return TABS.some((t) => t.key === tail) ? (tail as string) : 'board';
}

/**
 * Which stop of the trail a trip has reached. Deliberately generous: a trip is
 * only "scheduling" once something is actually placed on a day, and only
 * "gathering" once an idea exists. Nothing here narrows what you can open —
 * every stop stays reachable, per "nothing is discarded".
 */
function stepFromTab(tab: string): TrailStep {
  if (tab === 'schedule') return 'schedule';
  if (tab === 'board' || tab === 'map' || tab === 'checklist') return 'gather';
  return 'brainstorm';
}

/**
 * Shared shell for every trip surface: title, dates, the trail, and the tab bar.
 * The schedule inverts to the dark outdoor-reading surface; every other tab sits
 * on paper.
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
          <div className={styles.trail}>
            <TrailNav
              current={stepFromTab(tab)}
              onDark={onDark}
              onSelect={(step) => {
                if (step === 'schedule') navigate(`/trips/${trip.id}/schedule`);
                else navigate(`/trips/${trip.id}`);
              }}
            />
          </div>
        </div>

        <div className={styles.tabs}>
          <TabBar
            tabs={TABS}
            activeKey={tab}
            aria-label="Trip views"
            onChange={(key) =>
              navigate(key === 'board' ? `/trips/${trip.id}` : `/trips/${trip.id}/${key}`)
            }
          />
        </div>

        <Outlet context={{ trip }} />
      </div>
    </div>
  );
}
