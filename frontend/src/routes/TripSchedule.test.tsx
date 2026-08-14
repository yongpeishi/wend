import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { setRole } from '../mocks/db';
import { TripSchedule } from './TripSchedule';
import type { TripRole } from '../api/types';

// Seeded trip 1 (src/mocks/db.ts): Nanzen-ji placed 09:00–09:40 on the first
// day, Kiyamachi unplaced, and the empty bundle "Day one dinner options".
const TRIP_ID = 1;
const BUNDLE_ID = 4;
const FIRST_DAY = '2026-11-02';
const OPTION = 'Ramen at Ippudo';

// The schedule reads `trip` from useOutletContext, which only exists inside an
// <Outlet> — routed through a stand-in layout, the same shape TripLayout gives.
// The dates matter here: they are what the day tabs are built from.
function TestTripLayout() {
  return (
    <Outlet
      context={{
        trip: { id: TRIP_ID, title: 'Six days in Kyoto', starts_on: FIRST_DAY, ends_on: '2026-11-08' },
      }}
    />
  );
}

/** `role` mounts the provider TripLayout mounts in the app. Omitted, there is
 * no provider and the context hands back its editable default. */
function renderSchedule(role?: TripRole) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const schedule = (
    <MemoryRouter initialEntries={['/trips/1/schedule']}>
      <Routes>
        <Route path="/trips/:id" element={<TestTripLayout />}>
          <Route path="schedule" element={<TripSchedule />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {role ? <TripRoleProvider role={role}>{schedule}</TripRoleProvider> : schedule}
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/**
 * Puts the seeded bundle on the first day with one option in it, so the
 * "choose one" block is on the grid. Nothing seeds a scheduled bundle, and it
 * is the one block whose read-only treatment is its own code path.
 */
async function scheduleTheBundle() {
  await api.post('/entries', { entry: { kind: 'idea', title: OPTION }, parent_id: BUNDLE_ID });
  await api.post(`/trips/${TRIP_ID}/schedule`, {
    schedule_item: {
      entry_id: BUNDLE_ID,
      day: FIRST_DAY,
      starts_at_minutes: 19 * 60,
      ends_at_minutes: 20 * 60,
    },
  });
}

/** The options block, by the one line only it renders. */
function optionsBlock(): HTMLElement {
  return screen.getByText('Day one dinner options — choose one').closest('div') as HTMLElement;
}

describe('TripSchedule', () => {
  it('draws the day as it stands, with the ways of changing it', async () => {
    await scheduleTheBundle();
    renderSchedule();

    expect(await screen.findByText('Nanzen-ji')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move back to ideas' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Place at…' }).length).toBeGreaterThan(0);
    // The bundle's members arrive on their own request, so this waits.
    expect(await within(optionsBlock()).findByRole('button', { name: OPTION })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

/**
 * Written in two halves on purpose: the first asserts the affordances are gone,
 * the second asserts the plan is still all there. A test with only the first
 * half passes on a blank page, which is the one outcome read-only mode must
 * never produce.
 */
describe('TripSchedule — as a viewer', () => {
  beforeEach(async () => {
    // Signed in and genuinely a viewer in the fixtures, not merely told to
    // render as one.
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(TRIP_ID, 1, 'viewer');
    await scheduleTheBundle();
  });

  it('takes every way of changing the plan away', async () => {
    renderSchedule('viewer');
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByRole('button', { name: 'Move back to ideas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Place at…' })).not.toBeInTheDocument();
    // The options become plain lines rather than disabled buttons. Waited for
    // first, so this cannot pass on a block whose members simply had not
    // arrived yet.
    await within(optionsBlock()).findByText(OPTION);
    expect(within(optionsBlock()).queryByRole('button')).not.toBeInTheDocument();
  });

  it('leaves the whole day, the tray and the options on screen', async () => {
    renderSchedule('viewer');

    // The plan is the thing a viewer came to read: block, time and meta line.
    expect(await screen.findByText('Nanzen-ji')).toBeInTheDocument();
    // The block's own time range, not the 09:00 hour label beside it.
    expect(screen.getByText('09:00–09:40')).toBeInTheDocument();
    expect(screen.getByText(/40 min/)).toBeInTheDocument();
    // Day tabs are reading, not editing — they stay.
    expect(screen.getByRole('tablist', { name: 'Days' })).toBeInTheDocument();
    // What is still unplaced is as much a part of where the trip has got to.
    expect(screen.getByText('Ideas not yet placed')).toBeInTheDocument();
    expect(screen.getByText('Kiyamachi')).toBeInTheDocument();
    // And the choice, with the option still readable.
    expect(await within(optionsBlock()).findByText(OPTION)).toBeInTheDocument();
  });

  it('gives the whole day back to a member', async () => {
    setRole(TRIP_ID, 1, 'member');
    renderSchedule('member');
    await screen.findByText('Nanzen-ji');

    expect(screen.getByRole('button', { name: 'Move back to ideas' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Place at…' }).length).toBeGreaterThan(0);
    expect(await within(optionsBlock()).findByRole('button', { name: OPTION })).toBeInTheDocument();
  });
});
