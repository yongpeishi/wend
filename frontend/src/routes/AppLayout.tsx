import { Link, NavLink, Outlet, useMatch } from 'react-router-dom';
import { Logo } from '../design/components/brand/Logo';
import { useEntry } from '../api/entries';
import { useAuth } from '../auth/AuthContext';
import { FeedbackButton } from '../features/feedback/FeedbackButton';
import { formatTripDates, formatTripLength, joinMeta } from '../lib/formatDates';
import styles from './AppLayout.module.css';

/**
 * The trip's own views. Same set, same order and same destinations as the
 * segmented tab bar that used to sit under the trip header — only the
 * presentation moved. `board` is the index route, so it has no path segment.
 *
 * The design's sub-nav names five views (Ideas, Bundles, Hour by hour, Map,
 * Before you go). Four of those are these four under different words, and
 * "Bundles" is not a view at all here — bundles live in the board's right-hand
 * rail. Renaming the labels is a copy decision, not part of "make the sidebar
 * look like the design", so the words stay and only the presentation changes.
 */
const TRIP_TABS = [
  { key: 'board', label: 'Ideas' },
  { key: 'map', label: 'Map' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'checklist', label: 'Checklist' },
];

/** One person shown under "Planning with", as a circle of initials. */
interface Planner {
  id: number;
  name: string;
}

/** First letter of the name, for the avatar circle. Falls back to a middot. */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '·';
}

/**
 * Shell for every authenticated route: a fixed 246px sidebar on deep leaf, then
 * the route's own content. The sidebar is sticky full-height on desktop and
 * folds into a horizontal bar on narrow viewports so it never crushes the page.
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
  const { user, signOut } = useAuth();

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

  /*
   * Who is planning this trip. There is no members or collaborators endpoint —
   * see the report accompanying this change — so this is assembled from what
   * the client already knows: you, plus anyone who has voted on the trip
   * itself. That under-reports a co-planner who has not voted yet, but it never
   * invents a person, and it needs no request the sidebar was not already
   * making. Swap the source for a real members list when one exists.
   */
  const planners: Planner[] = [];
  if (trip && user) planners.push({ id: user.id, name: user.name });
  for (const vote of data?.votes ?? []) {
    if (!vote.user_name || planners.some((planner) => planner.id === vote.user_id)) continue;
    planners.push({ id: vote.user_id, name: vote.user_name });
  }

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

                {planners.length > 0 && (
                  <div className={styles.planners}>
                    <div className={styles.rule} />
                    <div className={styles.sectionLabel}>Planning with</div>
                    <ul className={styles.avatars}>
                      {planners.map((planner) => (
                        <li key={planner.id} className={styles.avatar} title={planner.name}>
                          {/* The letter is a picture of the person; their name is
                              what a screen reader should hear. */}
                          <span aria-hidden="true">{initial(planner.name)}</span>
                          <span className={styles.srOnly}>{planner.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <button type="button" className={styles.signOut} onClick={() => signOut()}>
          Sign out
        </button>
      </nav>

      <main className={styles.main}>
        <Outlet />
      </main>

      {/* Inside the authenticated shell so feedback always has an author, and
          outside <Outlet> so it survives route changes. */}
      <FeedbackButton />
    </div>
  );
}
