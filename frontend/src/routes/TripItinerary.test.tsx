import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { findEntry } from '../mocks/db';
import { TripItinerary } from './TripItinerary';
import { TripLayout } from './TripLayout';

// Integration test: the real container, the real TripLayout that hands it the
// trip, and the MSW fixtures (src/mocks) standing in for the Rails API. The
// layout is not a stand-in here because the dates gate writes to the trip
// entry and then has to see the new dates come back through it.
//
// The seeded trip (src/mocks/db.ts) is "Six days in Kyoto", 2–8 Nov 2026:
//   Day 1 · Mon 2   lodging, a bundle and an idea with a 1 hr 20 hole between
//   Day 2 · Tue 3   two live versions, nothing settled
//   Day 3 · Wed 4   lodging, one live version and one archived
//   Days 4–7        untouched
// Kiyamachi, Coffee at Weekenders and Nishiki market are in no live version,
// so the rail starts with three things in it.

const SEEDED_TRIP_ID = 1;

function renderItinerary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/trips/${SEEDED_TRIP_ID}/itinerary`]}>
          <Routes>
            <Route path="/trips/:id" element={<TripLayout />}>
              <Route path="itinerary" element={<TripItinerary />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Date inputs are filled by the browser's own control, not by keystrokes. */
function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Opens one day by clicking its collapsed row. */
async function openDay(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByText(label));
  return screen.findByRole('heading', { name: label });
}

describe('TripItinerary — the dates gate', () => {
  it('asks for the dates before drawing any days, and opens them once it has both', async () => {
    const trip = findEntry(SEEDED_TRIP_ID);
    if (trip) {
      trip.starts_on = null;
      trip.ends_on = null;
    }
    const user = userEvent.setup();
    renderItinerary();

    expect(await screen.findByRole('heading', { name: 'When are you going?' })).toBeInTheDocument();
    // Counted once the trip's ideas and bundles land — the gate draws as soon
    // as the trip does and fills its own line in.
    expect(await screen.findByText(/You've kept 9 things for Six days in Kyoto/)).toBeInTheDocument();
    expect(screen.queryByText('Day 1 · Mon 2')).not.toBeInTheDocument();

    setDate('First day', '2026-11-02');
    setDate('Last day', '2026-11-04');
    await user.click(screen.getByRole('button', { name: 'Open the days' }));

    // The gate PATCHes the trip itself, so the days appear only once the trip
    // has come back with its new dates — three of them, counting both ends.
    expect(await screen.findByText('Day 1 · Mon 2')).toBeInTheDocument();
    expect(screen.getByText('Day 3 · Wed 4')).toBeInTheDocument();
    expect(screen.queryByText('Day 4 · Thu 5')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'When are you going?' })).not.toBeInTheDocument();
  });

  it('comes back prefilled when "Change dates" reopens it over a trip that has them', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    await user.click(screen.getByRole('button', { name: 'Change dates' }));

    expect(screen.getByLabelText('First day')).toHaveValue('2026-11-02');
    expect(screen.getByLabelText('Last day')).toHaveValue('2026-11-08');

    // "Back to ideas" from here is a change of mind about the dates, not about
    // the screen: it returns to the day list rather than leaving for the board.
    await user.click(screen.getByRole('button', { name: 'Back to ideas' }));
    expect(await screen.findByText('Day 1 · Mon 2')).toBeInTheDocument();
  });
});

describe('TripItinerary — the day list', () => {
  it('draws every date of the trip, placed or not, with what is on it', async () => {
    renderItinerary();

    expect(await screen.findByText('Day 1 · Mon 2')).toBeInTheDocument();
    expect(screen.getByText('Day 7 · Sun 8')).toBeInTheDocument();
    expect(screen.getByText('Nanzen-ji · Nishiki market crawl')).toBeInTheDocument();
    // An empty day is a legitimate day, never an error.
    expect(screen.getAllByText('Nothing here yet')).toHaveLength(4);
    expect(screen.getByText('Machiya near Gion')).toBeInTheDocument();
  });

  it("states the trip's length, and says once that a day is unsettled", async () => {
    renderItinerary();

    expect(await screen.findByText('2–8 Nov · 7 days')).toBeInTheDocument();
    // One day of the seven carries two live versions.
    expect(screen.getByText('1 day split · not settled')).toBeInTheDocument();
    expect(screen.getByText('2 versions · not settled')).toBeInTheDocument();
  });

  it('opens every day at once and closes them all again', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    await user.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getAllByRole('heading', { name: /^Day \d · / })).toHaveLength(7);

    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(screen.queryByRole('heading', { name: /^Day \d · / })).not.toBeInTheDocument();
    expect(screen.getByText('Day 1 · Mon 2')).toBeInTheDocument();
  });

  it('opens one day on its own, leaving the rest closed', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');

    await openDay(user, 'Day 1 · Mon 2');

    expect(screen.getAllByRole('heading', { name: /^Day \d · / })).toHaveLength(1);
    // The open day draws its running order, and the hole in the middle of it.
    expect(screen.getByText('Bundle · Nishiki market crawl')).toBeInTheDocument();
    expect(screen.getByText('Nothing planned · 1 hr 20')).toBeInTheDocument();
  });
});

describe('TripItinerary — placing what is waiting', () => {
  it('places a kept idea on a day from the rail, with no dragging at all', async () => {
    const user = userEvent.setup();
    renderItinerary();
    expect(await screen.findByText('Not placed yet · 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Kiyamachi to a day' }));
    await user.click(screen.getByRole('button', { name: 'Add to Day 4 · Thu 5' }));

    // The day had no row on the server at all: the API makes it, and its first
    // version, on the way in. It opens so the placement is visible.
    expect(
      await screen.findByRole('button', { name: 'Change the hours for Kiyamachi, now 09:00–10:30' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Day 4 · Thu 5' })).toBeInTheDocument();
    // Placed somewhere, so it stops waiting — but nothing was consumed: the
    // other two are still on the rail.
    expect(await screen.findByText('Not placed yet · 2')).toBeInTheDocument();
  });
});

describe('TripItinerary — versions', () => {
  it('forks a day into a second version, and says the trip has another day unsettled', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 1 · Mon 2');
    await openDay(user, 'Day 1 · Mon 2');

    await user.click(screen.getByRole('button', { name: 'Fork this day' }));

    expect(await screen.findByRole('heading', { name: 'Version B' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Version A' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('2 days split · not settled')).toBeInTheDocument());
  });

  it('settles a split day on one version and keeps the other in Archived', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 2 · Tue 3');
    await openDay(user, 'Day 2 · Tue 3');

    // The seeded day already has one archived version elsewhere in the trip, so
    // keeping this one takes the panel from one to two.
    expect(screen.getByRole('button', { name: /Archived · 1/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Keep Version B for Day 2 · Tue 3/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Archived · 2/ })).toBeInTheDocument());
    // Settled: one version left, and nothing left to say about it.
    expect(screen.queryByRole('heading', { name: 'Version B' })).not.toBeInTheDocument();
    expect(screen.queryByText('2 versions · not settled')).not.toBeInTheDocument();
    expect(screen.queryByText(/day split · not settled/)).not.toBeInTheDocument();
  });

  it('shows what was set aside, and brings it back onto its own day', async () => {
    const user = userEvent.setup();
    renderItinerary();
    await screen.findByText('Day 3 · Wed 4');

    // Collapsed behind a count: it is rarely reached, and the rail belongs to
    // the things still waiting to be placed.
    expect(screen.queryByText('Day 3 · Wed 4 · Version B')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Archived · 1/ }));

    // Trip-wide, so the row has to name the day it came from.
    expect(screen.getByText('Day 3 · Wed 4 · Version B')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Bring back Day 3 · Wed 4 · Version B' }));

    // Back as a live version beside the one that was kept, on an opened day.
    expect(await screen.findByRole('heading', { name: 'Day 3 · Wed 4' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Version B' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archived · / })).not.toBeInTheDocument();
  });
});
