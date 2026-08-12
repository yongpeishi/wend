import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { Library } from './Library';
import type { MapViewProps } from '../features/map/MapView';

// Same reasoning as TripMap.test.tsx: jsdom can't render real Leaflet, so the
// map is mocked to a plain stub that exposes the props Library.tsx wires up
// (pins, selectedId, onSelectCluster, onBoundsChange) as clickable buttons /
// readable text, so the sync logic itself is exercised end to end.
vi.mock('../features/map/MapView', () => ({
  MapView: (props: MapViewProps) => (
    <div data-testid="map-view">
      <p data-testid="map-selected-id">selected: {String(props.selectedId)}</p>
      <ul>
        {props.pins.map((pin) => (
          <li key={pin.id}>{pin.title} (pin)</li>
        ))}
      </ul>
      <button type="button" onClick={() => props.onSelectCluster?.(props.pins.map((p) => p.id))}>
        Simulate cluster click
      </button>
      <button
        type="button"
        onClick={() =>
          props.onBoundsChange?.({ north: 34.98, south: 34.96, east: 135.78, west: 135.76 })
        }
      >
        Simulate pan to Fushimi Inari only
      </button>
    </div>
  ),
}));

function renderLibrary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/library']}>
          <Routes>
            <Route path="/library" element={<Library />} />
            <Route path="/trips/:id" element={<div>Trip page</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

// Entry id 5 is the seeded library idea (src/mocks/db.ts): "Fushimi Inari at
// dawn", kind idea, zero parent links, lat/lng set — squarely in the library
// and on the map both.
const SEEDED_LIBRARY_ID = 5;

describe('Library', () => {
  it('lists every unassigned idea and shows it on the map', async () => {
    renderLibrary();
    expect(await screen.findByText('Fushimi Inari at dawn')).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 1/)).toBeInTheDocument();
  });

  it('shows the brief empty-state copy once nothing is kept', async () => {
    await api.delete(`/entries/${SEEDED_LIBRARY_ID}`); // set aside the only seeded library idea
    renderLibrary();
    expect(await screen.findByText('Nothing kept yet. Saving something is how a trip starts.')).toBeInTheDocument();
  });

  it('filters hide rows, never delete them, and "See all" always undoes it', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText('Fushimi Inari at dawn');

    // Unfiltered: the whole library is listed, so the escape hatch is absent
    // rather than greyed out — same as the board's.
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Place' }));
    expect(screen.getByText(/Showing 1 of 1/)).toBeInTheDocument(); // Fushimi Inari is category "place"

    await user.click(screen.getByRole('button', { name: 'Food' }));
    expect(screen.getByText(/Showing 0 of 1/)).toBeInTheDocument();
    expect(screen.queryByText('Fushimi Inari at dawn')).not.toBeInTheDocument();

    const widen = screen.getByRole('button', { name: 'See all' });
    expect(widen).toBeEnabled();
    await user.click(widen);
    expect(await screen.findByText('Fushimi Inari at dawn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
  });

  it('quick-add keeps a pasted URL as source_url, titled by hand, no unfurling', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText('Fushimi Inari at dawn');

    await user.type(screen.getByLabelText('Paste a link'), 'https://example.com/ramen-alley');
    await user.type(screen.getByLabelText('Give it a title'), 'Ramen alley');
    await user.click(screen.getByRole('button', { name: 'Keep it' }));

    expect(await screen.findByText('Ramen alley')).toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();

    const entries = await api.get<{ entries: { title: string; source_url: string | null }[] }>('/entries', {
      params: { unassigned: true, kind: 'idea' },
    });
    const created = entries.entries.find((e) => e.title === 'Ramen alley');
    expect(created?.source_url).toBe('https://example.com/ramen-alley');
  });

  it('hovering a row highlights its pin — the list -> map sync', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const row = await screen.findByText('Fushimi Inari at dawn');

    expect(screen.getByTestId('map-selected-id')).toHaveTextContent('selected: null');
    await user.hover(row.closest('[class]') ?? row);
    await waitFor(() => expect(screen.getByTestId('map-selected-id')).toHaveTextContent(`selected: ${SEEDED_LIBRARY_ID}`));
  });

  it('panning the map narrows the list to what is in view, without touching the total count', async () => {
    await api.post('/entries', {
      entry: { kind: 'idea', title: 'Somewhere far away', category: 'place', lat: 10, lng: 10 },
    });
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText('Fushimi Inari at dawn');
    await screen.findByText('Somewhere far away');
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Fushimi Inari only' }));

    await waitFor(() => expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument());
    expect(screen.getByText('Fushimi Inari at dawn')).toBeInTheDocument();
    expect(screen.queryByText('Somewhere far away')).not.toBeInTheDocument();
  });

  it('zooming a cluster selects its ideas — "start a trip from these nine"', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText('Fushimi Inari at dawn');

    expect(screen.getByText('Nothing selected yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simulate cluster click' }));
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
  });

  it('"take these somewhere" creates a trip linking the selection, and never removes the original entries', async () => {
    const user = userEvent.setup();
    renderLibrary();
    await screen.findByText('Fushimi Inari at dawn');

    await user.click(screen.getByLabelText(`Select Fushimi Inari at dawn`));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Take these somewhere' }));
    await user.type(screen.getByLabelText("What's this trip called?"), 'Kyoto in autumn');
    await user.click(screen.getByRole('button', { name: 'Start the trip' }));

    expect(await screen.findByText('Trip page')).toBeInTheDocument();

    // The idea itself is untouched: still there, still unarchived. Linking never deletes.
    const detail = await api.get<{ entry: { archived_at: string | null; title: string } }>(`/entries/${SEEDED_LIBRARY_ID}`);
    expect(detail.entry.archived_at).toBeNull();
    expect(detail.entry.title).toBe('Fushimi Inari at dawn');
  });

  it('known limitation: once linked into a trip, the idea stops matching the unassigned=true query', async () => {
    // This documents a real conflict between screens.md ("the ideas stay in
    // the library too") and architecture.md §3's derived trip membership
    // (an entry with ANY trip ancestor is no longer "unassigned"), as
    // implemented in src/mocks/db.ts#tripAncestorId and mirrored by the real
    // backend per doc/assumptions.md A4. Both are outside this agent's
    // ownership (mocks/**, backend/**) and can't be reconciled from here —
    // see the final report for the flag. This test exists so the gap is
    // verified, not just asserted in prose.
    const before = await api.get<{ entries: { id: number }[] }>('/entries', {
      params: { unassigned: true, kind: 'idea' },
    });
    expect(before.entries.map((e) => e.id)).toContain(SEEDED_LIBRARY_ID);

    const trip = await api.post<{ entry: { id: number } }>('/entries', { entry: { kind: 'trip', title: 'Test trip' } });
    await api.post(`/entries/${trip.entry.id}/links`, { child_id: SEEDED_LIBRARY_ID });

    const after = await api.get<{ entries: { id: number }[] }>('/entries', {
      params: { unassigned: true, kind: 'idea' },
    });
    expect(after.entries.map((e) => e.id)).not.toContain(SEEDED_LIBRARY_ID);
  });
});
