import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../api';
import { AppLayout } from './AppLayout';
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
    // Same set, same order and same destinations as the old segmented tab bar.
    expect(within(tripNav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Ideas',
      'Map',
      'Schedule',
      'Checklist',
    ]);
    expect(within(tripNav).getByRole('link', { name: 'Ideas' })).toHaveAttribute('href', '/trips/1');
    expect(within(tripNav).getByRole('link', { name: 'Map' })).toHaveAttribute('href', '/trips/1/map');
    expect(within(tripNav).getByRole('link', { name: 'Schedule' })).toHaveAttribute(
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

  it('marks the trip view you are on as the current page', () => {
    renderShell(`/trips/${SEEDED_TRIP_ID}/schedule`);
    const tripNav = screen.getByRole('navigation', { name: 'Trip views' });
    expect(within(tripNav).getByRole('link', { name: 'Schedule' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // "Ideas" is the index route: it must not stay lit on every child view.
    expect(within(tripNav).getByRole('link', { name: 'Ideas' })).not.toHaveAttribute('aria-current');
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
});
