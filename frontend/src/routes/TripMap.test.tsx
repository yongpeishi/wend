import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../components/Toast';
import { server } from '../mocks/server';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { TripMap } from './TripMap';
import type { TripRole } from '../api/types';
import type { MapViewProps } from '../features/map/MapView';

// jsdom cannot render a real Leaflet map (see features/map/MapView.tsx's own
// doc comment), so the seam is mocked here — this exercises the real wiring
// (pins built from entries, filtering, selection -> popover, click-to-add)
// without fighting the renderer. Clustering/bounds/geocode logic itself is
// unit-tested directly in src/features/map/.
vi.mock('../features/map/MapView', () => ({
  MapView: (props: MapViewProps) => (
    <div data-testid="map-view">
      {/* Only when the route actually bound a handler — the real MapView binds
          its click listener the same way, so "no handler" has to be visible here
          rather than a button that quietly does nothing. */}
      {props.onMapClick && (
        <button type="button" onClick={() => props.onMapClick?.(35.02, 135.77)}>
          Simulate map click
        </button>
      )}
      {props.pins.map((pin) => (
        <div key={pin.id} data-testid={`pin-${pin.id}`}>
          <button type="button" onClick={() => props.onSelectPin?.(pin.id)}>
            {pin.title} ({pin.state})
          </button>
          {props.selectedId === pin.id && props.renderPopup?.(pin.id)}
        </div>
      ))}
    </div>
  ),
}));

// TripMap reads `trip` from useOutletContext, which only exists inside an
// <Outlet>. Route it through a stand-in layout route so the context is real,
// the same shape TripLayout provides in the app.
function TestTripLayout() {
  return <Outlet context={{ trip: { id: 1, title: 'Six days in Kyoto' } }} />;
}

/** `role` mounts the provider TripLayout mounts in the app. Omitted, the context
 * hands back its editable default — which is what every test below was written
 * against. */
function renderWithLayout(role?: TripRole) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const map = (
    <MemoryRouter initialEntries={['/trips/1/map']}>
      <Routes>
        <Route path="/trips/:id" element={<TestTripLayout />}>
          <Route path="map" element={<TripMap />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{role ? <TripRoleProvider role={role}>{map}</TripRoleProvider> : map}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TripMap', () => {
  it('shows a pin for every located idea in the trip, and the plain-word count', async () => {
    renderWithLayout();
    expect(await screen.findByText('Nanzen-ji (scheduled)')).toBeInTheDocument();
    expect(screen.getByText('Kiyamachi (potential)')).toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
  });

  it('filters hide pins, never delete them, and "See all" always undoes it', async () => {
    const user = userEvent.setup();
    renderWithLayout();
    await screen.findByText('Nanzen-ji (scheduled)');

    // Every pin is on the map, so there is nothing to widen back to and the
    // escape hatch is absent rather than greyed out — same as the board's.
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Scheduled' }));
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
    expect(screen.queryByText('Kiyamachi (potential)')).not.toBeInTheDocument();

    const widen = screen.getByRole('button', { name: 'See all' });
    expect(widen).toBeEnabled();
    await user.click(widen);
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
    expect(screen.getByText('Kiyamachi (potential)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
  });

  // The seeded trip holds one "place" (Nanzen-ji, scheduled) and one "activity"
  // (Kiyamachi, potential), so each category chip picks out exactly one pin and
  // the union of both is visibly different from either alone.
  it('lights any number of category chips at once and shows the union of them', async () => {
    const user = userEvent.setup();
    renderWithLayout();
    await screen.findByText('Nanzen-ji (scheduled)');

    await user.click(screen.getByRole('button', { name: 'Place' }));
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
    expect(screen.queryByText('Kiyamachi (potential)')).not.toBeInTheDocument();

    // A second chip joins the first rather than replacing it — the whole point
    // of the multi-select. Both stay pressed, and both kinds of pin are back.
    await user.click(screen.getByRole('button', { name: 'Activity' }));
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Activity' })).toHaveAttribute('aria-pressed', 'true');

    // Category and schedule state still narrow together.
    await user.click(screen.getByRole('button', { name: 'Scheduled' }));
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
    expect(screen.getByText('Nanzen-ji (scheduled)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Scheduled' }));

    // Turning one category off leaves the other lit and its pin on the map.
    await user.click(screen.getByRole('button', { name: 'Place' }));
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
    expect(screen.getByText('Kiyamachi (potential)')).toBeInTheDocument();
    expect(screen.queryByText('Nanzen-ji (scheduled)')).not.toBeInTheDocument();

    // "See all" clears the whole selection at once, not one chip at a time.
    await user.click(screen.getByRole('button', { name: 'See all' }));
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activity' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens a compact popover on pin click, stating status in words and linking to the entry', async () => {
    const user = userEvent.setup();
    renderWithLayout();
    const pinButton = await screen.findByRole('button', { name: 'Nanzen-ji (scheduled)' });
    await user.click(pinButton);

    const pin = screen.getByTestId('pin-2');
    expect(within(pin).getByText('Scheduled')).toBeInTheDocument();
    expect(within(pin).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/entries/2');
  });

  it('captures a located idea by clicking the map — the manual, geocode-free path', async () => {
    const user = userEvent.setup();
    renderWithLayout();
    await screen.findByText('Nanzen-ji (scheduled)');

    await user.click(screen.getByRole('button', { name: 'Add a place' }));
    await user.click(screen.getByRole('button', { name: 'Simulate map click' }));

    const titleInput = screen.getByPlaceholderText('Name this idea');
    await user.type(titleInput, 'A riverside bench');
    await user.click(screen.getByRole('button', { name: 'Add to the trip' }));

    await waitFor(() => expect(screen.getByText('A riverside bench (potential)')).toBeInTheDocument());
    expect(screen.getByText(/Showing 3 of 3/)).toBeInTheDocument();
  });
});

describe('TripMap — as a viewer', () => {
  it('keeps every pin and every filter, and takes both ways of adding one away', async () => {
    const user = userEvent.setup();
    renderWithLayout('viewer');

    // The map is the content here, and it is untouched.
    expect(await screen.findByText('Nanzen-ji (scheduled)')).toBeInTheDocument();
    expect(screen.getByText('Kiyamachi (potential)')).toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();

    // Narrowing what is on the map is reading, not editing.
    await user.click(screen.getByRole('button', { name: 'Scheduled' }));
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See all' }));

    expect(screen.queryByRole('button', { name: 'Add a place' })).not.toBeInTheDocument();
    // The second way in: with no handler bound, a map click cannot open the form
    // either — the stub only offers the button when the prop is there.
    expect(screen.queryByRole('button', { name: 'Simulate map click' })).not.toBeInTheDocument();
  });
});

/** A failed load is not an unpinned map — the screen must never claim nothing
 * is on it about places it simply could not fetch. */
describe('TripMap — when the load fails', () => {
  it('says the places failed to load instead of claiming the map is empty, and offers a way back', async () => {
    server.use(http.get('/api/entries', () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    renderWithLayout();

    expect(
      await screen.findByText("Your places didn't load. Nothing is lost — every pin is still where you put it."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText(/Nothing on the map yet/)).not.toBeInTheDocument();
  });
});
