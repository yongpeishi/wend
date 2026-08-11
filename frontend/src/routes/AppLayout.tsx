import { Link, NavLink, Outlet, useMatch } from 'react-router-dom';
import { Logo } from '../design/components/brand/Logo';
import { useEntry } from '../api/entries';
import { useAuth } from '../auth/AuthContext';
import { FeedbackButton } from '../features/feedback/FeedbackButton';
import styles from './AppLayout.module.css';

/**
 * The trip's own views. Same set, same order and same destinations as the
 * segmented tab bar that used to sit under the trip header — only the
 * presentation moved. `board` is the index route, so it has no path segment.
 */
const TRIP_TABS = [
  { key: 'board', label: 'Ideas' },
  { key: 'map', label: 'Map' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'checklist', label: 'Checklist' },
];

/**
 * Shell for every authenticated route: a fixed 246px sidebar on deep leaf, then
 * the route's own content. The sidebar is sticky full-height on desktop and
 * folds into a horizontal bar on narrow viewports so it never crushes the page.
 *
 * When you are inside a trip the sidebar also carries that trip's sub-nav. It
 * lives here rather than in TripLayout because the sidebar is the one piece of
 * chrome that survives every route change: the trip you are planning stays in
 * view, and the page below is left to the content alone.
 */
export function AppLayout() {
  const { signOut } = useAuth();

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

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Main">
        <div className={styles.brandRow}>
          <Link to="/" className={styles.brandLink}>
            <Logo variant="reversed" size={28} />
          </Link>
        </div>

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
            {/* Withheld until the trip loads: a placeholder title would be a
                guess at the one thing on this screen the traveller named. */}
            {trip && <div className={styles.tripTitle}>{trip.title}</div>}
            <nav className={styles.tripNav} aria-label="Trip views">
              {TRIP_TABS.map((tab) => (
                <NavLink
                  key={tab.key}
                  to={tab.key === 'board' ? `/trips/${tripId}` : `/trips/${tripId}/${tab.key}`}
                  // Only the index route needs the exact match; without it every
                  // child view would light "Ideas" up as well.
                  end={tab.key === 'board'}
                  className={({ isActive }) =>
                    [styles.navItem, isActive ? styles.navItemActive : ''].filter(Boolean).join(' ')
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}

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
