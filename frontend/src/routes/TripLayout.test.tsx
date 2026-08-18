import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { server } from '../mocks/server';
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

/**
 * Final schedule used to invert the whole shell to the deep-leaf surface, and
 * this component knew which URL it was on for that one reason. Both mockups now
 * put the schedule on paper, so there is no dark surface left in the product —
 * and no tab whose shell differs from any other tab's.
 */
describe('TripLayout — one surface, every tab', () => {
  it('paints the schedule on the same paper as the board', async () => {
    const board = renderLayout(`/trips/${TRIP_ID}`);
    await screen.findByText('The board');
    // The inversion was an extra wrapper around the whole shell, so the shape
    // of the outermost element is exactly what used to differ between tabs.
    const paper = (board.container.firstElementChild as HTMLElement).className;
    board.unmount();

    const schedule = renderLayout(`/trips/${TRIP_ID}/schedule`);
    await screen.findByText('The schedule');

    expect((schedule.container.firstElementChild as HTMLElement).className).toBe(paper);
    expect(schedule.container.querySelector('[class*="onDark"]')).toBeNull();
  });
});

/**
 * There is one door to the roster now, and it is the sidebar's "Planning with"
 * cluster (AppLayout). The header used to hold a second one; these tests are
 * here so it cannot quietly grow back and give the same job two places to live.
 */
describe('TripLayout — the header offers no share control', () => {
  it('has no "Bring someone along" button, even for the owner who once had one', async () => {
    renderLayout();
    await screen.findByRole('heading', { name: 'Six days in Kyoto' });
    expect(screen.queryByRole('button', { name: 'Bring someone along' })).not.toBeInTheDocument();
  });

  it('offers an owner no control at all up here — the header is text', async () => {
    renderLayout();
    await screen.findByRole('heading', { name: 'Six days in Kyoto' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('dialog', { name: "Who's on this trip" })).not.toBeInTheDocument();
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

/**
 * "That trip isn't here" is a claim about the world — the trip is gone — and
 * only a 404 has earned it. A 500 or a dead network is a claim about the wire,
 * and because every trip tab renders under this layout, getting the two mixed
 * up here would tell someone with a flaky connection that their trip was
 * deleted, on every tab at once.
 */
describe('TripLayout — when the trip fails to load', () => {
  it('a server failure says the trip did not load and offers a way back — never that it is gone', async () => {
    server.use(http.get('/api/entries/:id', () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    const user = userEvent.setup();
    renderLayout();

    expect(
      await screen.findByText("This trip didn't load. Nothing is lost — it's all still here."),
    ).toBeInTheDocument();
    expect(screen.queryByText("That trip isn't here")).not.toBeInTheDocument();

    // The server comes back, and "Try again" brings the trip with it.
    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Six days in Kyoto' })).toBeInTheDocument();
  });

  it('a 404 still says the trip is not here — the one failure that means exactly that', async () => {
    server.use(
      http.get('/api/entries/:id', () => HttpResponse.json({ error: 'Not found' }, { status: 404 })),
    );
    renderLayout();

    expect(await screen.findByText("That trip isn't here")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
