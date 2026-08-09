import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SignIn } from './SignIn';
import { AuthProvider, useAuth } from '../auth/AuthContext';

// Integration test: SignIn against the real POST /api/session hook, served by
// the MSW fixtures (src/mocks) rather than a running Rails backend.

function Whoami() {
  const { user } = useAuth();
  return <div data-testid="whoami">{user ? user.name : 'anonymous'}</div>;
}

function renderSignIn() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/signin']}>
        <AuthProvider>
          <Routes>
            <Route path="/signin" element={<SignIn />} />
            <Route path="/" element={<Whoami />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SignIn', () => {
  it('signs in with the seeded demo user and navigates to "/"', async () => {
    renderSignIn();
    await userEvent.type(screen.getByLabelText('Email'), 'demo@wend.app');
    await userEvent.type(screen.getByLabelText('Password'), 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Take the long way in' }));
    expect(await screen.findByTestId('whoami')).toHaveTextContent('Demo Traveler');
  });

  it('shows an error message on invalid credentials and stays on the sign-in screen', async () => {
    renderSignIn();
    await userEvent.type(screen.getByLabelText('Email'), 'demo@wend.app');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Take the long way in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('switches to the sign-up form and back', async () => {
    renderSignIn();
    await userEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in instead' }));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });
});
