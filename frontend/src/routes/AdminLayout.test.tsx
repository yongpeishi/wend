import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../api';
import { AuthProvider } from '../auth/AuthContext';
import { ToastProvider } from '../components/Toast';
import { AdminLayout } from './AdminLayout';

// Integration test: the admin shell against the real session hooks and the MSW
// fixtures, the AppLayout.test idiom. The demo user is the seeded admin; Sarah
// is the seeded non-admin the guard exists to turn back.

function renderShell(initialPath = '/admin/feedback') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <AuthProvider>
            <Routes>
              {/* Stand-ins for where the guard sends people. */}
              <Route path="/signin" element={<p>Sign in screen</p>} />
              <Route path="/" element={<p>The app home</p>} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="feedback" element={<p>Admin feedback screen</p>} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('AdminLayout', () => {
  it('shows an admin the plum shell around the routed screen', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    renderShell();

    const sidebar = await screen.findByRole('navigation', { name: 'Admin' });
    // The badge beside the wordmark is what names the surface.
    expect(within(sidebar).getByText('Admin')).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: 'Feedback' })).toHaveAttribute(
      'href',
      '/admin/feedback',
    );
    // The way home and the way out, at the foot — as in the app shell.
    expect(within(sidebar).getByRole('link', { name: 'Back to app' })).toHaveAttribute('href', '/');
    expect(within(sidebar).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();

    expect(screen.getByText('Admin feedback screen')).toBeInTheDocument();
  });

  it('marks the feedback screen as where you are', async () => {
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    renderShell();
    expect(await screen.findByRole('link', { name: 'Feedback' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  // The link never shows for them, but a typed /admin URL must not work either.
  it('turns a signed-in non-admin back to the app', async () => {
    await api.post('/session', { email: 'sarah@wend.app', password: 'password' });
    renderShell();

    expect(await screen.findByText('The app home')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin' })).not.toBeInTheDocument();
  });

  // Normally ProtectedRoute's job — the shell holds the same line on its own.
  it('sends a signed-out visitor to sign in', async () => {
    renderShell();
    expect(await screen.findByText('Sign in screen')).toBeInTheDocument();
  });
});
