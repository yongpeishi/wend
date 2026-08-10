import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './AppLayout';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { ToastProvider } from '../components/Toast';

// Integration test: the shell against the real session hooks, served by the MSW
// fixtures (src/mocks) rather than a running Rails backend.

function Whoami() {
  const { user, isLoading } = useAuth();
  return <div data-testid="whoami">{isLoading ? 'loading' : (user?.name ?? 'anonymous')}</div>;
}

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      {/* Provider stack mirrors App.tsx: the shell renders FeedbackButton, which
          reaches for the toast context. */}
      <ToastProvider>
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<div>Route content here</div>} />
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
    expect(screen.getByRole('link', { name: 'Wend' })).toHaveAttribute('href', '/');
  });

  it('renders the routed Outlet content beside the sidebar', () => {
    renderShell();
    expect(screen.getByText('Route content here')).toBeInTheDocument();
  });

  it('signs out from the sidebar', async () => {
    const user = userEvent.setup();
    renderShell();
    // Signed in first, via the seeded session fixture.
    expect(await screen.findByTestId('whoami')).toHaveTextContent('Demo Traveler');

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByTestId('whoami')).toHaveTextContent('anonymous');
  });
});
