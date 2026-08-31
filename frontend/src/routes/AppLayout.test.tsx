import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { api } from '../api';
import { server } from '../mocks/server';
import { findEntry, setRole } from '../mocks/db';
import { AppLayout } from './AppLayout';
import styles from './AppLayout.module.css';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { ToastProvider } from '../components/Toast';

// Integration test: the shell against the real session hooks, served by the MSW
// fixtures (src/mocks) rather than a running Rails backend.

/** Stands in for a routed screen: proves the Outlet renders, and who is signed in. */
function RouteContent() {
  const { user, isLoading } = useAuth();
  return (
    <div>
      <p>Route content here</p>
      <p data-testid="whoami">{isLoading ? 'loading' : (user?.name ?? 'anonymous')}</p>
    </div>
  );
}

/** The seeded trip in the MSW fixtures (src/mocks/db.ts): "Six days in Kyoto". */
const SEEDED_TRIP_ID = 1;
/** The demo user owns it; Sarah is deliberately not on it. */
const DEMO_USER_ID = 1;
const SARAH_USER_ID = 2;

function renderShell(initialPath = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      {/* Provider stack mirrors App.tsx: the shell renders FeedbackButton, which
          reaches for the toast context. */}
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <AuthProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<RouteContent />} />
                {/* The trip's routes are stand-ins: what matters here is that
                    the shell recognises a trip URL, not what the trip renders. */}
                <Route path="/trips/:id" element={<RouteContent />}>
                  <Route path="itinerary" element={<RouteContent />} />
                  <Route path="map" element={<RouteContent />} />
                  <Route path="schedule" element={<RouteContent />} />
                  <Route path="checklist" element={<RouteContent />} />
                </Route>
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('AppLayout', () => {
  it('renders the sidebar as a labelled nav with the Explore section', () => {
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    expect(sidebar).toBeInTheDocument();
    expect(screen.getByText('Explore')).toBeInTheDocument();
  });

  it('links "All trips" to "/" and marks it as the current page', () => {
    renderShell();
    const allTrips = screen.getByRole('link', { name: 'All trips' });
    expect(allTrips).toHaveAttribute('href', '/');
    // NavLink stamps aria-current on the active route, so "you are here" is
    // real state, not a colour the screen reader can't see.
    expect(allTrips).toHaveAttribute('aria-current', 'page');
  });

  it('links "Inspiration" to "/library"', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Inspiration' })).toHaveAttribute('href', '/library');
  });

  it('keeps the brand lock-up as a link home', () => {
    renderShell();
    // The lock-up is the mark's aria-label plus the wordmark text, so match loosely.
    expect(screen.getByRole('link', { name: /wend/i })).toHaveAttribute('href', '/');
  });

  it('renders the routed Outlet content beside the sidebar', () => {
    renderShell();
    expect(screen.getByText('Route content here')).toBeInTheDocument();
  });

  it('keeps the PLAN block out of the sidebar when no trip is open', () => {
    renderShell();
    expect(screen.queryByText('Plan')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Trip views' })).not.toBeInTheDocument();
  });

  it('shows the trip sub-nav in the sidebar on a trip route', async () => {
    renderShell(`/trips/${SEEDED_TRIP_ID}`);
    expect(screen.getByText('Plan')).toBeInTheDocument();

    const tripNav = screen.getByRole('navigation', { name: 'Trip views' });
    // The order you plan in: ideas, then days, then where those days sit on the
    // ground, then what to do before you go, then the finished plan.
    expect(within(tripNav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Ideas',
      'Map',
      'Itinerary',
      'Checklist',
      'Final schedule',
    ]);
    expect(within(tripNav).getByRole('link', { name: 'Ideas' })).toHaveAttribute('href', '/trips/1');
    expect(within(tripNav).getByRole('link', { name: 'Itinerary' })).toHaveAttribute(
      'href',
      '/trips/1/itinerary',
    );
    expect(within(tripNav).getByRole('link', { name: 'Map' })).toHaveAttribute('href', '/trips/1/map');
    // Renamed, not rerouted: the finished plan is the same URL it always was.
    expect(within(tripNav).getByRole('link', { name: 'Final schedule' })).toHaveAttribute(
      'href',
      '/trips/1/schedule',
    );
    expect(within(tripNav).getByRole('link', { name: 'Checklist' })).toHaveAttribute(
      'href',
      '/trips/1/checklist',
    );

    // Named once the trip itself has loaded, never guessed at beforehand.
    expect(await screen.findByText('Six days in Kyoto')).toBeInTheDocument();
  });

  // The design's PLAN panel carries the trip's length and dates under its name.
  it('says how long the trip is and when it runs', async () => {
    renderShell(`/trips/${SEEDED_TRIP_ID}`);
    // The seeded trip runs 2–8 Nov, which is seven days counting both ends.
    expect(await screen.findByText('7 days · 2–8 Nov')).toBeInTheDocument();
  });

  // A trip with no dates is a normal, permanent state — the line goes away
  // rather than apologising for it. resetDb() puts the dates back afterwards.
  it('leaves the meta line out for a trip with no dates', async () => {
    const trip = findEntry(SEEDED_TRIP_ID);
    if (trip) {
      trip.starts_on = null;
      trip.ends_on = null;
    }
    renderShell(`/trips/${SEEDED_TRIP_ID}`);

    await screen.findByText('Six days in Kyoto');
    expect(screen.queryByText(/days ·/)).not.toBeInTheDocument();
  });

  // "Planning with" is the trip's real collaborator list now, not whoever
  // happened to have voted — so it names everyone who is on the trip and nobody
  // who merely left a mark on it.
  it('names who is planning the trip, starting with you', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    renderShell(`/trips/${SEEDED_TRIP_ID}`);

    expect(await screen.findByText('Planning with')).toBeInTheDocument();
    // The circle shows an initial; the name is what assistive tech hears. The
    // people come first — the last item in the list is the dashed +.
    const [you] = screen.getAllByRole('listitem');
    expect(you).toHaveTextContent('DDemo Traveler');
  });

  // Sarah has voted on the seeded trip but is not on it. The old list was built
  // from votes and would have named her; this one asks who is actually here.
  it('names everyone the trip says is on it, and nobody it does not', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(SEEDED_TRIP_ID, SARAH_USER_ID, 'viewer');
    renderShell(`/trips/${SEEDED_TRIP_ID}`);

    await screen.findByText('Planning with');
    // Two people, then the dashed + that shares their list.
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(screen.getByText('Sarah')).toBeInTheDocument();

    setRole(SEEDED_TRIP_ID, SARAH_USER_ID, null);
  });

  it('opens the panel that says who is on the trip from a face', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    const user = userEvent.setup();
    renderShell(`/trips/${SEEDED_TRIP_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Demo Traveler' }));

    expect(await screen.findByRole('dialog', { name: "Who's on this trip" })).toBeInTheDocument();
  });

  // The dashed + is the way to bring someone along, and it opens the same panel
  // the faces do — one screen for who is on this trip, reached from the cluster.
  it('opens the same panel from the dashed + at the end of the cluster', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    const user = userEvent.setup();
    renderShell(`/trips/${SEEDED_TRIP_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Add someone to this trip' }));

    expect(await screen.findByRole('dialog', { name: "Who's on this trip" })).toBeInTheDocument();
  });

  // A viewer sees who they are reading along with — they simply have no door.
  it('leaves a viewer the faces without making them buttons', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(SEEDED_TRIP_ID, DEMO_USER_ID, 'viewer');
    renderShell(`/trips/${SEEDED_TRIP_ID}`);

    await screen.findByText('Planning with');
    expect(screen.getByRole('listitem')).toHaveTextContent('DDemo Traveler');
    expect(screen.queryByRole('button', { name: 'Demo Traveler' })).not.toBeInTheDocument();
    // No + either: the cluster ends at the last face rather than offering a
    // door that would be shut in their face.
    expect(screen.queryByRole('button', { name: 'Add someone to this trip' })).not.toBeInTheDocument();
  });

  // Having no door is the whole problem: a viewer cannot press a face to see
  // the roster, so the cluster itself has to say who is here — everyone at
  // once, in roster order, on hover or on focus.
  it('spells out every planner beside a viewer’s cluster', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(SEEDED_TRIP_ID, DEMO_USER_ID, 'viewer');
    setRole(SEEDED_TRIP_ID, SARAH_USER_ID, 'viewer');
    const { container } = renderShell(`/trips/${SEEDED_TRIP_ID}`);

    await screen.findByText('Planning with');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

    const revealed = container.querySelector<HTMLElement>(`.${styles.plannerNames}`);
    expect(revealed).toBeInTheDocument();
    expect(Array.from(revealed?.children ?? []).map((line) => line.textContent)).toEqual([
      'Demo Traveler',
      'Sarah',
    ]);
    // Silent on purpose: every face already carries its planner's name in an
    // .srOnly span, so announcing this too would read the roster twice.
    expect(revealed).toHaveAttribute('aria-hidden', 'true');

    setRole(SEEDED_TRIP_ID, SARAH_USER_ID, null);
  });

  // The browser's own tooltip is slow and names one person at a time; left on,
  // it would arrive on top of the reveal that has already answered.
  it('takes the native tooltip off a viewer’s faces', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(SEEDED_TRIP_ID, DEMO_USER_ID, 'viewer');
    const { container } = renderShell(`/trips/${SEEDED_TRIP_ID}`);

    await screen.findByText('Planning with');
    await waitFor(() => expect(screen.getByRole('listitem')).toHaveTextContent('Demo Traveler'));
    expect(container.querySelector('[title="Demo Traveler"]')).toBeNull();
  });

  // Nothing changes for anyone who can share: their face is a door, and a panel
  // opening under the pointer on the way to it would only be in the way.
  it('leaves a sharer their tooltip and no group reveal', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    const { container } = renderShell(`/trips/${SEEDED_TRIP_ID}`);

    expect(await screen.findByRole('button', { name: 'Demo Traveler' })).toHaveAttribute(
      'title',
      'Demo Traveler',
    );
    expect(container.querySelector(`.${styles.plannerNames}`)).toBeNull();
  });

  // Gated on the roster alone, an owner whose collaborator list came back empty
  // was left with no way to bring anyone along at all.
  it('still offers the + when the roster is empty', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    server.use(
      http.get('/api/trips/:tripId/collaborators', () =>
        HttpResponse.json({ collaborators: [], my_role: 'owner' }),
      ),
    );
    renderShell(`/trips/${SEEDED_TRIP_ID}`);

    expect(
      await screen.findByRole('button', { name: 'Add someone to this trip' }),
    ).toBeInTheDocument();
  });

  it('keeps "Planning with" out when nobody is known yet', async () => {
    renderShell(`/trips/${SEEDED_TRIP_ID}`);
    await screen.findByText('Six days in Kyoto');
    expect(screen.queryByText('Planning with')).not.toBeInTheDocument();
  });

  it('marks the trip view you are on as the current page', () => {
    renderShell(`/trips/${SEEDED_TRIP_ID}/schedule`);
    const tripNav = screen.getByRole('navigation', { name: 'Trip views' });
    expect(within(tripNav).getByRole('link', { name: 'Final schedule' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // "Ideas" is the index route: it must not stay lit on every child view.
    expect(within(tripNav).getByRole('link', { name: 'Ideas' })).not.toHaveAttribute('aria-current');
  });

  // Feedback and sign out are one pair at the end of the nav — feedback is a
  // nav control now, not something painted over the page, and sign out is the
  // last thing in the sidebar on a desk and the top-right corner on a phone.
  // Both of those come out of this one bit of DOM: same wrapper, sign out last,
  // wrapper last in the nav. jsdom does not evaluate media queries, so the order
  // is what is provable here, and the order is what both widths are built on.
  it('ends the nav with feedback and sign out, sign out last', () => {
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Main' });
    const feedback = within(sidebar).getByRole('button', { name: 'Give feedback' });
    const signOut = within(sidebar).getByRole('button', { name: 'Sign out' });

    // One wrapper holds both, and nothing in the nav comes after it.
    const utilities = feedback.parentElement as HTMLElement;
    expect(signOut.parentElement).toBe(utilities);
    expect(sidebar.lastElementChild).toBe(utilities);

    // Feedback, then sign out — and the composer is closed, so the pair really
    // is the whole of the group.
    expect(Array.from(utilities.children)).toEqual([feedback, signOut]);
  });

  // Sign out stays out on the bar rather than going into the drawer: it is the
  // only way off a shared device, and it must not be a thing you first have to
  // find a menu for. It lives in the Main nav, which is what becomes the bar and
  // the drawer both — so the nav holds the whole of the phone's chrome.
  it('keeps sign out inside the nav that becomes the phone bar', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    renderShell(`/trips/${SEEDED_TRIP_ID}`);
    const shell = screen.getByRole('navigation', { name: 'Main' });
    expect(within(shell).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    // Alongside, not instead of: the header's other two subjects are in the
    // same nav, so the fold has all three to lay out.
    expect(within(shell).getByRole('navigation', { name: 'Trip views' })).toBeInTheDocument();
    expect(await within(shell).findByRole('button', { name: 'Demo Traveler' })).toBeInTheDocument();
  });

  // The door into the admin area exists only for the accounts that can open
  // it. The demo user is the seeded admin; Sarah is the seeded non-admin.
  it('offers an admin the way into the admin area, beside sign out', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    renderShell();

    const link = await screen.findByRole('link', { name: 'Admin area' });
    expect(link).toHaveAttribute('href', '/admin');
    // In the pair at the foot of the nav, with the other things that are about
    // you rather than about the trip.
    expect(link.parentElement).toBe(screen.getByRole('button', { name: 'Sign out' }).parentElement);
  });

  it('never shows an ordinary traveller the admin area', async () => {
    await api.post('/session', { email: 'sarah@wend.app', password: 'password' });
    renderShell();

    await waitFor(() => expect(screen.getByTestId('whoami')).toHaveTextContent('Sarah'));
    expect(screen.queryByRole('link', { name: 'Admin area' })).not.toBeInTheDocument();
  });

  it('signs out from the sidebar', async () => {
    // Sign in first: the MSW fixtures start with no session (src/mocks/db.ts).
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    const user = userEvent.setup();
    renderShell();
    await waitFor(() => expect(screen.getByTestId('whoami')).toHaveTextContent('Demo Traveler'));

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByTestId('whoami')).toHaveTextContent('anonymous'));
  });

  // The button is the only thing on screen that knows the request is running,
  // so it has to say so — and stop taking clicks while it does, or an impatient
  // second click fires a second DELETE.
  it('says it is signing out and refuses a second click while the request is in flight', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    // Held open by hand rather than by a timer: the assertion runs against a
    // request that is genuinely still in flight, with no sleep to tune.
    let release = () => {};
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.delete('/api/session', async () => {
        await inFlight;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderShell();
    await waitFor(() => expect(screen.getByTestId('whoami')).toHaveTextContent('Demo Traveler'));

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    const pending = await screen.findByRole('button', { name: 'Signing out…' });
    expect(pending).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled());
  });

  // A sign out that fails must not look like one that worked: you are still
  // signed in, and you are told so rather than left guessing.
  it('keeps you signed in and says so when signing out fails', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    server.use(http.delete('/api/session', () => HttpResponse.json({ error: 'Boom' }, { status: 500 })));

    const user = userEvent.setup();
    renderShell();
    await waitFor(() => expect(screen.getByTestId('whoami')).toHaveTextContent('Demo Traveler'));

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(
      await screen.findByText('Could not sign you out. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('whoami')).toHaveTextContent('Demo Traveler');
    // Still offered, and still clickable: failing left the traveller exactly
    // where they were, with the same way out.
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
  });

  // The words say what happens; a door with an arrow through it is a picture of
  // the same two words that plenty of people read as "log in".
  it('signs out with words and no icon', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Sign out' }).querySelector('svg')).toBeNull();
  });

  /*
   * jsdom does not evaluate media queries, so every one of these runs against
   * the desktop cascade: the drawer is laid out as the sidebar, and the two
   * controls that exist only on a phone are `display: none` — which is exactly
   * right. A hidden element has no accessible name to be found by, so they are
   * reached for by their class, the same way the planner reveal above is.
   *
   * What is provable here is the state the phone CSS hangs off: which control
   * opens the drawer, that it starts closed, and every way back out of it.
   */
  describe('the phone menu', () => {
    /** The bar's menu button — phone-only, so not reachable by role here. */
    function menuButton(container: HTMLElement): HTMLElement {
      const button = container.querySelector<HTMLElement>(`.${styles.menuButton}`);
      expect(button).toBeInTheDocument();
      return button as HTMLElement;
    }

    it('offers a menu button that starts closed and names the nav it opens', () => {
      const { container } = renderShell();
      const menu = menuButton(container);
      expect(menu).toHaveAttribute('aria-expanded', 'false');

      // Named, not duplicated: the panel it points at is the one nav everyone
      // else is reading, links and roster and all.
      const panel = document.getElementById(menu.getAttribute('aria-controls') ?? '');
      expect(panel).toContainElement(screen.getByRole('link', { name: 'All trips' }));
    });

    it('opens the drawer and offers the way back out of it', async () => {
      const user = userEvent.setup();
      const { container } = renderShell();

      await user.click(menuButton(container));

      expect(menuButton(container)).toHaveAttribute('aria-expanded', 'true');
      // The dimmed page and the close button beside the panel: neither has a
      // closed appearance, so neither exists until the drawer is out.
      expect(container.querySelector(`.${styles.scrim}`)).toBeInTheDocument();
      expect(container.querySelector(`.${styles.drawerClose}`)).toBeInTheDocument();
    });

    it('closes the drawer from the close button', async () => {
      const user = userEvent.setup();
      const { container } = renderShell();

      await user.click(menuButton(container));
      await user.click(container.querySelector<HTMLElement>(`.${styles.drawerClose}`) as HTMLElement);

      expect(menuButton(container)).toHaveAttribute('aria-expanded', 'false');
      expect(container.querySelector(`.${styles.drawerClose}`)).toBeNull();
    });

    it('closes the drawer on Escape', async () => {
      const user = userEvent.setup();
      const { container } = renderShell();

      await user.click(menuButton(container));
      await user.keyboard('{Escape}');

      expect(menuButton(container)).toHaveAttribute('aria-expanded', 'false');
    });

    // Tapping the dimmed page is how a phone dismisses anything laid over it.
    it('closes the drawer when the page behind it is tapped', async () => {
      const user = userEvent.setup();
      const { container } = renderShell();

      await user.click(menuButton(container));
      await user.click(container.querySelector<HTMLElement>(`.${styles.scrim}`) as HTMLElement);

      expect(menuButton(container)).toHaveAttribute('aria-expanded', 'false');
      expect(container.querySelector(`.${styles.scrim}`)).toBeNull();
    });

    // Going somewhere is what the drawer is for, so arriving is what shuts it.
    it('closes the drawer once you have gone where it sent you', async () => {
      const user = userEvent.setup();
      const { container } = renderShell(`/trips/${SEEDED_TRIP_ID}/map`);

      await user.click(menuButton(container));
      await user.click(screen.getByRole('link', { name: 'Itinerary' }));

      expect(menuButton(container)).toHaveAttribute('aria-expanded', 'false');
    });

    // The page cannot scroll away underneath an open drawer, and it gets its
    // scroll back the moment the drawer closes — left set, the whole app would
    // be frozen by a menu nobody can see any more.
    it('holds the page still while the drawer is open and lets it go after', async () => {
      const user = userEvent.setup();
      const { container } = renderShell();

      await user.click(menuButton(container));
      expect(document.body.style.overflow).toBe('hidden');

      await user.keyboard('{Escape}');
      expect(document.body.style.overflow).toBe('');
    });

    // The keyboard must not be left on a button that has just slid off the side
    // of the screen.
    it('puts focus in the drawer and hands it back to the button on closing', async () => {
      const user = userEvent.setup();
      const { container } = renderShell();
      const menu = menuButton(container);

      await user.click(menu);
      expect(document.getElementById(menu.getAttribute('aria-controls') ?? '')).toHaveFocus();

      await user.keyboard('{Escape}');
      expect(menu).toHaveFocus();
    });
  });

  /*
   * The desk's fold. jsdom runs the desktop cascade, so unlike the phone menu
   * above the toggle is visible here and reachable by its accessible name.
   * What is provable is the state the desktop CSS hangs off: the class on the
   * nav, the one button that points both ways, and the flag that carries the
   * choice across visits. The 64px width itself is a media-query fact jsdom
   * cannot see.
   */
  describe('collapsing the sidebar', () => {
    // The flag is meant to persist across visits; the tests are not visits.
    afterEach(() => {
      localStorage.clear();
    });

    it('offers a collapse button and starts expanded', () => {
      renderShell();
      const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('navigation', { name: 'Main' })).not.toHaveClass(
        styles.sidebarCollapsed,
      );
    });

    it('folds the sidebar to the rail and offers the way back', async () => {
      const user = userEvent.setup();
      renderShell();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

      expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass(styles.sidebarCollapsed);
      // The same button, renamed and pointing the other way — the keyboard is
      // still on it, and its name now says what pressing will do.
      const expand = screen.getByRole('button', { name: 'Expand sidebar' });
      expect(expand).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument();
    });

    it('expands the sidebar again from the rail', async () => {
      const user = userEvent.setup();
      renderShell();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
      await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));

      expect(screen.getByRole('navigation', { name: 'Main' })).not.toHaveClass(
        styles.sidebarCollapsed,
      );
      expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    it('remembers the fold across visits', async () => {
      const user = userEvent.setup();
      const { unmount } = renderShell();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
      expect(localStorage.getItem('wend:sidebar-collapsed')).toBe('true');

      // A fresh shell — a new tab, the next morning — reads the flag back and
      // starts on the rail rather than opening wide and snapping shut.
      unmount();
      renderShell();
      expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass(styles.sidebarCollapsed);
      expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    });

    it('writes the expanded choice back too', async () => {
      const user = userEvent.setup();
      renderShell();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
      await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));

      expect(localStorage.getItem('wend:sidebar-collapsed')).toBe('false');
    });

    // The fold and the phone drawer are separate questions with separate
    // answers: collapsing the desk's sidebar must not open, close or otherwise
    // disturb the drawer state the phone bar hangs off.
    it('leaves the phone drawer state alone', async () => {
      const user = userEvent.setup();
      const { container } = renderShell();

      await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

      expect(container.querySelector(`.${styles.menuButton}`)).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      expect(container.querySelector(`.${styles.scrim}`)).toBeNull();
    });
  });
});
