import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useCollaborators, useEntry } from '../api';
import { ApiError } from '../api/client';
import { canDelete, canEdit, canShare } from '../auth/tripRole';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { Spinner } from '../components/Spinner';
import { Button } from '../design/components/core/Button';
import { formatTripDates } from '../lib/formatDates';
import styles from './TripLayout.module.css';

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
 * Shared shell for every trip surface: the trip's title and dates. Every tab
 * sits on paper. The schedule used to invert the whole shell to the deep-leaf
 * surface, and this component knew which URL it was on for that one reason —
 * both mockups now put Final schedule on paper too, so the product has no dark
 * surface and this has no reason to read the path.
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
  const { data, isPending, isError, error, refetch } = useEntry(tripId);

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

  // isPending rather than isLoading for the same reason as QueryGate: offline
  // (or in a hidden tab) the first fetch is PAUSED — isLoading false, no error,
  // no data — and reading isLoading would drop that state straight into "That
  // trip isn't here" below, asserting deletion to someone who merely lost
  // signal. isPending holds the spinner until data or an error actually lands.
  if (isPending) {
    return (
      <div className={styles.wrap}>
        <Spinner label="Finding your trip" />
      </div>
    );
  }

  // Two very different failures, two very different sentences. "That trip
  // isn't here" is a claim about the WORLD — the trip is gone — and only a 404
  // (or a success that came back empty) has earned it. Every other failure is
  // a claim about the WIRE: a 500 or a dead network says nothing about the
  // trip, so it gets the same honest treatment as QueryGate — what didn't
  // load, that nothing is lost, and a way to try again. This is hand-rolled
  // rather than QueryGate itself because of the 404 fork; the markup mirrors
  // the gate's error arm so the two read as one pattern. Every trip tab lives
  // under this layout, so getting this wrong here would shadow all of their
  // own gates at once.
  if (isError && !(error instanceof ApiError && error.status === 404)) {
    return (
      <div className={styles.wrap}>
        <EmptyState
          message="This trip didn't load. Nothing is lost — it's all still here."
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
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
      <div className={styles.wrap}>
        <div className={styles.head}>
          {/* One baseline row: the title with its dates beside it, per the
              slimmed header design. The dates are the title's annotation, not
              a line of their own — sharing the baseline is what says so. */}
          <div className={styles.headRow}>
            <h1 className={styles.title}>{trip.title}</h1>
            {dates ? (
              <p className={styles.dates}>{dates}</p>
            ) : (
              <p className={styles.noDates}>No dates yet</p>
            )}
          </div>

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
    </TripRoleProvider>
  );
}
