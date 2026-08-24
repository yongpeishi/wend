import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
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
 * the route's own content. The sidebar is sticky full-height on desktop; below
 * 860px it flattens into a single bar — a menu button in the top-left corner,
 * the mark beside it, and the two controls that are about you rather than about
 * the trip at the far end, sign out last so it lands in the top-right corner.
 * Everything else in the nav goes behind the menu button, as a drawer that
 * slides in over the page.
 *
 * The bar used to try to carry the whole nav: two links, five view chips and a
 * roster, wrapped onto two lines and scrolling sideways. That is a sidebar
 * lying down, and on a phone it cost more of the screen than the page it was
 * there to navigate. A drawer costs one tap and gives the width back.
 *
 * One set of markup still serves both. The drawer is not a phone copy of the
 * nav — it is the nav, the same links and the same roster, moved off-canvas by
 * CSS (see AppLayout.module.css) and laid out exactly as the sidebar lays it
 * out when it opens. So there is never a second copy of a link for a screen
 * reader to read out or for a test to have to choose between.
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
   * The phone drawer. Closed is the only sensible starting state — it is a
   * menu, and a menu that greets you already open is a screen you have to
   * dismiss before you can read the one you asked for.
   *
   * The state is kept at every width and simply has nothing to do above 860px,
   * where the panel is the sidebar and is open by virtue of being the page's
   * left-hand column. Gating it on a media query would mean the layout reads
   * the viewport in two places — CSS and here — and the two would drift.
   */
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);
  const navPanelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Following a link is the drawer's whole purpose, so arriving somewhere is
  // what closes it. Keyed on the location rather than wired onto seven separate
  // links: it also covers the ways out that are not clicks — the back button,
  // and the redirect ProtectedRoute fires when a session ends.
  const { pathname } = useLocation();
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  /*
   * While it is open the drawer owns the screen: Escape closes it, and the page
   * underneath stops scrolling so a thumb dragging over the panel cannot leave
   * you somewhere else entirely by the time you close it. Focus moves into the
   * panel on the way in and back to the button on the way out, so the keyboard
   * is never left on a control that has just slid off the side of the screen.
   *
   * Focus is not trapped. This is a disclosure, not a dialog — the panel is the
   * page's own navigation, and it is `visibility: hidden` when closed, which is
   * what keeps its links out of the tab order at this width without any of this
   * having to run.
   */
  useEffect(() => {
    if (!navOpen) return;
    panelRef.current?.focus();
    // Read now, used on the way out. The button is the same node either way —
    // it is on the bar, not in the panel, so nothing unmounts it — but reaching
    // through the ref from inside the cleanup is the pattern that bites when
    // one day something does.
    const menu = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      menu?.focus();
    };
  }, [navOpen]);

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
        {/* The way into the nav on a phone, and nothing at all on a desk, where
            the nav is already on screen. It is first in the DOM as well as
            first on the bar: the top-left corner is where a menu lives, and a
            keyboard should reach it before the links it opens. `aria-expanded`
            is the whole of its state — the panel it controls is named rather
            than duplicated, so assistive tech reads the same nav everyone else
            is looking at. */}
        <button
          type="button"
          ref={menuButtonRef}
          className={styles.menuButton}
          onClick={() => setNavOpen((open) => !open)}
          aria-expanded={navOpen}
          aria-controls={navPanelId}
        >
          <Menu size={24} strokeWidth={1.5} aria-hidden="true" />
          <span className={styles.srOnly}>Menu</span>
        </button>

        <div className={styles.brandRow}>
          <Link to="/" className={styles.brandLink}>
            <Logo variant="reversed" size={28} />
          </Link>
        </div>

        {/* Only while the drawer is out: the page dimmed behind it, and the way
            back to the page. The close button sits beside the panel rather than
            inside it — the panel is a column of links, and a control in its top
            corner would read as the first of them. Out on the dimmed page it is
            unmistakably about the panel as a whole.

            Both are rendered on opening rather than hidden and revealed, because
            both exist only for the open state; there is no closed appearance for
            either of them to have. */}
        {navOpen && (
          <>
            <div className={styles.scrim} onClick={closeNav} />
            <button type="button" className={styles.drawerClose} onClick={closeNav}>
              <X size={22} strokeWidth={1.5} aria-hidden="true" />
              <span className={styles.srOnly}>Close menu</span>
            </button>
          </>
        )}

        {/* The nav proper, and on a phone the drawer. `tabIndex={-1}` is there
            for the focus move on opening and for nothing else — it takes focus
            when asked, and never sits in the tab order itself. */}
        <div
          id={navPanelId}
          ref={panelRef}
          tabIndex={-1}
          className={[styles.sections, navOpen ? styles.sectionsOpen : ''].filter(Boolean).join(' ')}
        >
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

        {/* The two things that are about you rather than about the trip, kept
            together at the end of the nav: somewhere to say how this is going,
            and the way off the device. They share one look so they read as a
            pair, and feedback lives here — where you go looking when you have
            something to say — instead of floating over the page you were
            trying to read. Sign out is last, on every width: the foot of the
            column on a desk, the top-right corner on a phone.

            The pair stays out on the bar rather than going into the drawer.
            Signing out is the one thing you must be able to do without first
            learning where the menu is, and on a shared device it is the only
            way off it.

            Feedback stays inside the authenticated shell so it always has an
            author, and outside <Outlet> so it survives route changes and can
            still name the screen you were on when you pressed it. */}
        <div className={styles.utilities}>
          <FeedbackButton
            className={`${styles.utilityButton} ${styles.feedbackButton}`}
            labelClassName={styles.utilityLabel}
          />

          {/* Words alone, at every width. "Sign out" is two of them and they say
              exactly what happens; a door with an arrow through it is a picture
              of the same two words that a fair number of people read as "log
              in", and it only ever earned its place here while the phone bar
              was short of room. The bar is not short of room any more.

              The label carries the pending state rather than a spinner: this is
              a text control, and "Signing out…" is both the status and the
              reason the button has stopped taking clicks. */}
          <button
            type="button"
            className={`${styles.utilityButton} ${styles.signOut}`}
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        <Outlet />
      </main>

      {/* The same panel the trip header opens — one screen for "who is on this
          trip", reachable from the faces that name them. It fetches nothing
          until it is open, so mounting it on every route costs nothing. */}
      {tripId && <SharePanel open={sharing} onClose={closeSharing} tripId={Number(tripId)} />}
    </div>
  );
}
