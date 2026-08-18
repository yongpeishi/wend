import { useCallback, useState } from 'react';
import { Link, NavLink, Outlet, useMatch } from 'react-router-dom';
import { Logo } from '../design/components/brand/Logo';
import { useEntry } from '../api/entries';
import { useCollaborators } from '../api/collaborators';
import { useAuth } from '../auth/AuthContext';
import { canShare } from '../auth/tripRole';
import { useToast } from '../components/Toast';
import { FeedbackButton } from '../features/feedback/FeedbackButton';
import { SharePanel } from '../features/trips/SharePanel';
import { formatTripDates, formatTripLength, joinMeta } from '../lib/formatDates';
import styles from './AppLayout.module.css';

/**
 * The trip's own views, in the order you plan in: keep the ideas, lay them onto
 * days, see where those days sit on the ground, sort out what you have to do
 * before you go, then read the finished plan on the road. `board` is the index
 * route, so it has no path segment.
 *
 * "Final schedule" rather than "Schedule": with an itinerary screen next door,
 * one word had to say which of the two is the finished one. Only the label
 * changed — /trips/:id/schedule is the same route it always was.
 *
 * Map is not in the itinerary design's sub-nav, and stays anyway: it shipped,
 * and taking a working view out of the nav is a regression rather than a
 * tidy-up. It sits next to the itinerary because it answers the same question
 * about the same days, from above rather than down the page.
 */
const TRIP_TABS = [
  { key: 'board', label: 'Ideas' },
  { key: 'map', label: 'Map' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'schedule', label: 'Final schedule' },
];

/** First letter of the name, for the avatar circle. Falls back to a middot. */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '·';
}

/**
 * Shell for every authenticated route: a fixed 246px sidebar on deep leaf, then
 * the route's own content. The sidebar is sticky full-height on desktop and
 * becomes the phone's header below 860px — the mark and the people on one line,
 * the trip's views as chips scrolling across the next. One set of markup serves
 * both: the header is the same nav, the same links and the same roster, folded
 * by CSS alone (see AppLayout.module.css), so there is never a second copy of a
 * link for a screen reader to read out or for a test to have to choose between.
 *
 * When you are inside a trip the sidebar also carries that trip's sub-nav. It
 * lives here rather than in TripLayout because the sidebar is the one piece of
 * chrome that survives every route change: the trip you are planning stays in
 * view, and the page below is left to the content alone.
 *
 * The trip block is the design's PLAN panel: the trip's name and length on a
 * slightly lifted ground, a ruled-off list of its views each with a trail dot,
 * and the people planning it. It is one card because it is one subject —
 * everything inside it belongs to the trip named at the top.
 */
export function AppLayout() {
  const { signOut, isSigningOut } = useAuth();
  const { show } = useToast();

  /*
   * Signing out is a request that can fail, so it is treated as one. The
   * rejection is caught here — left uncaught it was an unhandled promise and
   * the traveller was silently left signed in — and the failure is said out
   * loud, in the one place they just clicked.
   *
   * There is deliberately no redirect on success: ProtectedRoute already
   * navigates to /signin the moment `user` goes null, and a second navigation
   * would race it.
   */
  const handleSignOut = () => {
    signOut().catch(() => show('Could not sign you out. Check your connection and try again.', 'error'));
  };

  // `/trips/:id/*` covers every child view; the bare pattern catches the index
  // route on routers that do not let the splat match zero segments. Both hooks
  // run unconditionally — they simply return null off a trip route.
  const tripChildMatch = useMatch('/trips/:id/*');
  const tripIndexMatch = useMatch('/trips/:id');
  // Kept as the raw URL segment for the links, so the sub-nav always points back
  // at the trip the address bar actually names; only the query needs a number.
  const tripId = tripChildMatch?.params.id ?? tripIndexMatch?.params.id;

  // Already in the cache by the time TripLayout has rendered — this shares the
  // same query, so naming the trip in the sidebar costs no extra request.
  const { data } = useEntry(tripId ? Number(tripId) : undefined);
  const trip = data?.entry;

  // "6 days · 12–17 Oct". Both halves are optional: a trip with no dates is a
  // normal, permanent state, and the line simply goes away rather than
  // apologising for it.
  const tripMeta = trip
    ? joinMeta(formatTripLength(trip.starts_on, trip.ends_on), formatTripDates(trip.starts_on, trip.ends_on))
    : '';

  // Who is actually on this trip, from the endpoint that knows. This used to be
  // assembled from whoever had voted, which under-reported everyone who had not
  // yet — and only inside a trip, because there is nobody to list outside one.
  const { data: people } = useCollaborators(tripId ? Number(tripId) : 0, { enabled: Boolean(tripId) });
  const planners = people?.collaborators ?? [];
  const shareable = canShare(trip?.my_role ?? null);

  const [sharing, setSharing] = useState(false);
  // Memoized for Modal's focus effect — see SharePanel's own note.
  const closeSharing = useCallback(() => setSharing(false), []);

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Main">
        <div className={styles.brandRow}>
          <Link to="/" className={styles.brandLink}>
            <Logo variant="reversed" size={28} />
          </Link>
        </div>

        <div className={styles.sections}>
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Explore</div>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                [styles.navItem, isActive ? styles.navItemActive : ''].filter(Boolean).join(' ')
              }
            >
              All trips
            </NavLink>
            <NavLink
              to="/library"
              className={({ isActive }) =>
                [styles.navItem, isActive ? styles.navItemActive : ''].filter(Boolean).join(' ')
              }
            >
              Inspiration
            </NavLink>
          </div>

          {/* The design's PLAN block: the trip you are in, and its views. Absent
              everywhere else — an empty heading would be chrome for nothing. */}
          {tripId && (
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Plan</div>
              <div className={styles.tripCard}>
                {/* Withheld until the trip loads: a placeholder title would be a
                    guess at the one thing on this screen the traveller named. */}
                {trip && (
                  <>
                    <div className={styles.tripHead}>
                      <div className={styles.tripTitle}>{trip.title}</div>
                      {tripMeta && <div className={styles.tripMeta}>{tripMeta}</div>}
                    </div>
                    <div className={styles.rule} />
                  </>
                )}

                <nav className={styles.tripNav} aria-label="Trip views">
                  {TRIP_TABS.map((tab) => (
                    <NavLink
                      key={tab.key}
                      to={tab.key === 'board' ? `/trips/${tripId}` : `/trips/${tripId}/${tab.key}`}
                      // Only the index route needs the exact match; without it every
                      // child view would light "Ideas" up as well.
                      end={tab.key === 'board'}
                      className={({ isActive }) =>
                        [styles.navItem, styles.tripNavItem, isActive ? styles.navItemActive : '']
                          .filter(Boolean)
                          .join(' ')
                      }
                    >
                      {/* A stop on the trail, not decoration with a meaning of its
                          own — the link's own text and aria-current already say
                          where you are, so the dot is hidden from assistive tech. */}
                      <span className={styles.navDot} aria-hidden="true" />
                      {tab.label}
                    </NavLink>
                  ))}
                </nav>

                {/* Shown to anyone who can bring someone along even before the
                    roster lands — gated on the list alone, an owner with an
                    empty or still-loading list had no way in at all. */}
                {(planners.length > 0 || shareable) && (
                  <div className={styles.planners}>
                    <div className={styles.rule} />
                    <div className={styles.sectionLabel}>Planning with</div>
                    <ul className={styles.avatars}>
                      {planners.map((planner) => {
                        // The letter is a picture of the person; their name is
                        // what a screen reader should hear — which is also the
                        // button's accessible name when there is a button.
                        const face = (
                          <>
                            <span aria-hidden="true">{initial(planner.name)}</span>
                            <span className={styles.srOnly}>{planner.name}</span>
                          </>
                        );
                        return (
                          <li key={planner.user_id} className={styles.avatarItem}>
                            {/* Pressing a face opens the panel that says who is
                                here and lets you change it. A viewer gets the
                                same circles with nothing behind them: they can
                                see who they are reading along with, and there is
                                no door for them to find shut.

                                The owner's face keeps its native `title` — the
                                circle is a door, and the browser's own tooltip
                                is the label on it. The viewer's has none, so the
                                browser's slow one-name-at-a-time tooltip cannot
                                fight the cluster's own reveal below. */}
                            {shareable ? (
                              <button
                                type="button"
                                className={styles.avatar}
                                title={planner.name}
                                onClick={() => setSharing(true)}
                              >
                                {face}
                              </button>
                            ) : (
                              <span className={styles.avatar}>{face}</span>
                            )}
                          </li>
                        );
                      })}
                      {/* Last in the row, so bringing someone along is the next
                          empty place at the table rather than a separate
                          control. A viewer's cluster ends at the last face. */}
                      {shareable && (
                        <li className={styles.avatarItem}>
                          <button
                            type="button"
                            className={styles.addPerson}
                            onClick={() => setSharing(true)}
                          >
                            <span aria-hidden="true">+</span>
                            <span className={styles.srOnly}>Add someone to this trip</span>
                          </button>
                        </li>
                      )}
                    </ul>

                    {/* Who these letters are, all at once, for the one person
                        who cannot ask any other way. An owner presses a face
                        and gets the whole roster on a screen of its own; a
                        viewer's faces open nothing, so until now the only way
                        to learn who they were planning alongside was to rest
                        the pointer on one initial, wait for the browser, read
                        one name, and move to the next. The cluster answers the
                        question in one gesture instead — hover it, or focus
                        anything in it, and every name is there.

                        Only for a viewer: over a face that is already a door,
                        a panel that appears under the pointer is something to
                        get past on the way to the door, not help.

                        Hidden from assistive tech on purpose. Every face
                        already carries its planner's name in an .srOnly span,
                        so a screen reader has had the full roster all along;
                        announcing it a second time would be worse than never
                        having drawn this at all. This is a picture for people
                        who can only see initials. */}
                    {!shareable && (
                      <div className={styles.plannerNames} aria-hidden="true">
                        {planners.map((planner) => (
                          <span key={planner.user_id}>{planner.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* The label carries the pending state rather than a spinner: this is a
            text control, and "Signing out…" is both the status and the reason
            the button has stopped taking clicks. */}
        <button type="button" className={styles.signOut} onClick={handleSignOut} disabled={isSigningOut}>
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </nav>

      <main className={styles.main}>
        <Outlet />
      </main>

      {/* Inside the authenticated shell so feedback always has an author, and
          outside <Outlet> so it survives route changes.

          The slot around it is not decoration: on a phone the button is switched
          off there, and it has to be switched off from outside because the
          button is shared and knows nothing about who is showing it. Feedback is
          something you send from a desk; on the road the screen belongs to the
          plan, and the button's fixed bottom-left corner is exactly where the
          now bar and the thumb already are. */}
      <div className={styles.feedbackSlot}>
        <FeedbackButton />
      </div>

      {/* The same panel the trip header opens — one screen for "who is on this
          trip", reachable from the faces that name them. It fetches nothing
          until it is open, so mounting it on every route costs nothing. */}
      {tripId && <SharePanel open={sharing} onClose={closeSharing} tripId={Number(tripId)} />}
    </div>
  );
}
