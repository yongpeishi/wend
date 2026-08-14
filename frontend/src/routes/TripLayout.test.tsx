import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { setRole } from '../mocks/db';
import { TripLayout } from './TripLayout';

/**
 * The trip header is where a trip's permissions enter the app, so this is the
 * first place the three roles are visibly different. The seeded fixtures make
 * the demo user the owner of trip 1 (src/mocks/db.ts); `setRole` moves them,
 * and `resetDb()` in the global afterEach puts the seed back.
 */

const TRIP_ID = 1;
const DEMO_USER_ID = 1;
const SARAH_USER_ID = 2;

const SHARE = 'Bring someone along';

async function signIn() {
  await api.post('/session', { email: 'demo@wend.app', password: 'password' });
}

function renderLayout(path = `/trips/${TRIP_ID}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/trips/:id" element={<TripLayout />}>
              <Route index element={<p>The board</p>} />
              <Route path="schedule" element={<p>The schedule</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await signIn();
});

describe('TripLayout — the header', () => {
  it('draws the trip and its dates, and renders the view below it', async () => {
    renderLayout();
    expect(await screen.findByRole('heading', { name: 'Six days in Kyoto' })).toBeInTheDocument();
    expect(screen.getByText('2–8 Nov')).toBeInTheDocument();
    expect(screen.getByText('The board')).toBeInTheDocument();
  });
});

describe('TripLayout — the share trigger', () => {
  it('offers it to the owner', async () => {
    renderLayout();
    expect(await screen.findByRole('button', { name: SHARE })).toBeInTheDocument();
  });

  it('offers it to a member too — bringing others along is not the owner’s alone', async () => {
    setRole(TRIP_ID, DEMO_USER_ID, 'member');
    renderLayout();
    await screen.findByRole('heading', { name: 'Six days in Kyoto' });
    expect(screen.getByRole('button', { name: SHARE })).toBeInTheDocument();
  });

  it('keeps it away from a viewer — absent, never disabled', async () => {
    setRole(TRIP_ID, DEMO_USER_ID, 'viewer');
    renderLayout();
    await screen.findByRole('heading', { name: 'Six days in Kyoto' });
    expect(screen.queryByRole('button', { name: SHARE })).not.toBeInTheDocument();
  });

  it('opens the panel that says who is on the trip', async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(await screen.findByRole('button', { name: SHARE }));

    expect(await screen.findByRole('dialog', { name: "Who's on this trip" })).toBeInTheDocument();
  });
});

describe('TripLayout — the standing viewer line', () => {
  it('names the owner, so the reader knows who to ask', async () => {
    setRole(TRIP_ID, DEMO_USER_ID, 'viewer');
    setRole(TRIP_ID, SARAH_USER_ID, 'owner');
    renderLayout();

    expect(
      await screen.findByText("You're reading this one. Ask Sarah if you'd like to change something."),
    ).toBeInTheDocument();
  });

  // A trip whose owner has not come back from the list yet, or a list that never
  // arrives: the sentence still has to read like a sentence.
  it('falls back to a form with no name rather than printing "undefined"', async () => {
    setRole(TRIP_ID, DEMO_USER_ID, 'viewer');
    renderLayout();

    const line = await screen.findByText(/You're reading this one/);
    expect(line).toHaveTextContent(
      "You're reading this one. Ask whoever started this trip if you'd like to change something.",
    );
    expect(line.textContent).not.toContain('undefined');
  });

  it('stays away from an owner and a member', async () => {
    renderLayout();
    await screen.findByRole('heading', { name: 'Six days in Kyoto' });
    expect(screen.queryByText(/You're reading this one/)).not.toBeInTheDocument();
  });

  it('is a line on the page, not a Toast that leaves after four seconds', async () => {
    setRole(TRIP_ID, DEMO_USER_ID, 'viewer');
    renderLayout();

    const line = await screen.findByText(/You're reading this one/);
    // Toasts announce themselves; this is prose under the title.
    expect(line.closest('[role="status"]')).toBeNull();
    expect(line.closest('[role="alert"]')).toBeNull();
  });
});
