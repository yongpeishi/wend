import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useCollaborators, useEntry } from '../api';
import { canDelete, canEdit, canShare } from '../auth/tripRole';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { formatTripDates } from '../lib/formatDates';
import styles from './TripLayout.module.css';

const TAB_KEYS = ['board', 'itinerary', 'checklist', 'schedule', 'map'];

/**
 * The standing viewer line. Not a Toast: a Toast leaves after four seconds, and
 * this is a fact about the whole screen that stays true for as long as you are
 * on it. The name is the owner's, read off the collaborator list; without one
 * the sentence still has to work, so the fallback names the role rather than
 * printing "undefined" at a real person.
 */
function viewerLine(ownerName: string | null): string {
  const who = ownerName ?? 'whoever started this trip';
  return `You're reading this one. Ask ${who} if you'd like to change something.`;
}

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
 * sidebar, where it stays put while the page changes underneath it. So is the
 * way to bring someone along: the "Planning with" cluster is the one door to
 * the roster, so the header carries no action of its own and is text alone.
 *
 * It is also where a trip's permissions enter the app. The role arrives on the
 * trip payload, and this is the first component that has it, so it does two
 * things with it at once: it widens the outlet context for the four trip routes
 * below, and it mounts `TripRoleProvider` for everything deeper than an outlet
 * can reach — a bundle card six components down asks `useCanEdit()` and gets the
 * same answer the board does.
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

  // `?? null` is not decoration: `my_role` is optional on Entry, and the
  // predicates take `TripRole | null` precisely so `undefined` cannot slip
  // through and read as "viewer". See auth/tripRole.ts.
  const role = trip?.my_role ?? null;
  const editable = canEdit(role);
  const deletable = canDelete(role);
  const shareable = canShare(role);

  // Only a viewer needs this, and only to put a name in one sentence — so the
  // list is fetched for a viewer and nobody else. The share panel fetches the
  // same query key when it opens, so an owner pays for it exactly once and only
  // when they ask.
  const { data: people } = useCollaborators(tripId ?? 0, {
    enabled: tripId !== undefined && role === 'viewer',
  });
  const ownerName = people?.collaborators.find((person) => person.role === 'owner')?.name ?? null;

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
    <TripRoleProvider role={role}>
      <div className={onDark ? styles.onDark : undefined}>
        <div className={styles.wrap}>
          <div className={styles.head}>
            <h1 className={styles.title}>{trip.title}</h1>
            {dates ? (
              <p className={styles.dates}>{dates}</p>
            ) : (
              <p className={styles.noDates}>No dates yet</p>
            )}

            {role === 'viewer' && <p className={styles.viewerNote}>{viewerLine(ownerName)}</p>}
          </div>

          <Outlet
            context={{
              trip,
              role,
              canEdit: editable,
              canDelete: deletable,
              canShare: shareable,
            }}
          />
        </div>
      </div>
    </TripRoleProvider>
  );
}
