import { describe, expect, it } from 'vitest';
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

  // Below 860px the sidebar folds into the phone header, and the design has no
  // room in it for feedback: the button's fixed bottom-left corner is where the
  // plan and the thumb already are. jsdom does not evaluate media queries, so
  // what is provable here is that the button sits in a slot the stylesheet can
  // switch off from outside — the button itself is shared and stays untouched.
  it('puts the feedback button in a slot the phone header can switch off', () => {
    const { container } = renderShell();
    const slot = container.querySelector(`.${styles.feedbackSlot}`);
    expect(slot).toBeInTheDocument();
    expect(within(slot as HTMLElement).getByRole('button', { name: 'Give feedback' })).toBeInTheDocument();
  });

  // The mockup's phone header drops sign out; we keep it, because it is the
  // only way off this device and there is no other menu to hide it in. It lives
  // in the Main nav, which is what becomes that header — not somewhere the fold
  // would leave behind.
  it('keeps sign out inside the nav that becomes the phone header', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    renderShell(`/trips/${SEEDED_TRIP_ID}`);
    const shell = screen.getByRole('navigation', { name: 'Main' });
    expect(within(shell).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    // Alongside, not instead of: the header's other two subjects are in the
    // same nav, so the fold has all three to lay out.
    expect(within(shell).getByRole('navigation', { name: 'Trip views' })).toBeInTheDocument();
    expect(await within(shell).findByRole('button', { name: 'Demo Traveler' })).toBeInTheDocument();
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
});
