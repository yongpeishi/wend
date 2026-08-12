import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { TripMap } from './TripMap';
import type { MapViewProps } from '../features/map/MapView';

// jsdom cannot render a real Leaflet map (see features/map/MapView.tsx's own
// doc comment), so the seam is mocked here — this exercises the real wiring
// (pins built from entries, filtering, selection -> popover, click-to-add)
// without fighting the renderer. Clustering/bounds/geocode logic itself is
// unit-tested directly in src/features/map/.
vi.mock('../features/map/MapView', () => ({
  MapView: (props: MapViewProps) => (
    <div data-testid="map-view">
      <button type="button" onClick={() => props.onMapClick?.(35.02, 135.77)}>
        Simulate map click
      </button>
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

function renderWithLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/trips/1/map']}>
          <Routes>
            <Route path="/trips/:id" element={<TestTripLayout />}>
              <Route path="map" element={<TripMap />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
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
