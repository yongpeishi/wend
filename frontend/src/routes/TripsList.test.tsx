import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { TripsList } from './TripsList';
import type { Entry, EntryNote } from '../api/types';

function renderTrips() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<TripsList />} />
            <Route path="/trips/:id" element={<div>Trip page</div>} />
            <Route path="/library" element={<div>Library page</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

// The seeded trip (src/mocks/db.ts): "Six days in Kyoto", 2–8 Nov, three linked
// children, one pro and one con already on it.
const SEEDED_TRIP_ID = 1;
const TRIP_TITLE = 'Six days in Kyoto';

/** Reads the trip straight from the mock API — proof a change was persisted,
 * not just rendered optimistically. */
async function notesOf(id: number): Promise<{ pros: EntryNote[]; cons: EntryNote[] }> {
  const { entry } = await api.get<{ entry: Entry }>(`/entries/${id}`);
  return { pros: entry.pros, cons: entry.cons };
}

describe('TripsList', () => {
  it('shows each trip with its title, note and meta line', async () => {
    renderTrips();

    expect(await screen.findByRole('link', { name: TRIP_TITLE })).toHaveAttribute(
      'href',
      `/trips/${SEEDED_TRIP_ID}`,
    );
    expect(screen.getByDisplayValue('Temples, rivers, and slow mornings.')).toBeInTheDocument();
    // 2–8 Nov, and three things linked under the trip.
    expect(screen.getByText('2–8 Nov · 3 ideas')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Where next' })).toBeInTheDocument();
  });

  it('reads "No dates" and a singular idea count when there is nothing to show', async () => {
    const { entry } = await api.post<{ entry: Entry }>('/entries', {
      entry: { kind: 'trip', title: 'Malaysia, sometime' },
    });
    await api.post(`/entries/${entry.id}/links`, { child_id: 5 });

    renderTrips();
    expect(await screen.findByText('No dates · 1 idea')).toBeInTheDocument();
  });

  it('adds a pro through the inline input and persists the whole array', async () => {
    const user = userEvent.setup();
    renderTrips();
    await screen.findByRole('link', { name: TRIP_TITLE });

    await user.click(screen.getByRole('button', { name: `Add a pro to ${TRIP_TITLE}` }));
    await user.type(screen.getByRole('textbox', { name: `New pro for ${TRIP_TITLE}` }), 'The trains are easy{Enter}');

    expect(await screen.findByText('The trains are easy')).toBeInTheDocument();
    await waitFor(async () => {
      const { pros } = await notesOf(SEEDED_TRIP_ID);
      expect(pros.map((p) => p.text)).toEqual(['Flights are already booked', 'The trains are easy']);
    });
    // The id is the client's own, so removal can target the line itself.
    const { pros } = await notesOf(SEEDED_TRIP_ID);
    expect(pros[1]?.id).toEqual(expect.any(String));
    expect(pros[1]?.id).not.toBe('');
  });

  it('never creates a note from an empty input', async () => {
    const user = userEvent.setup();
    renderTrips();
    await screen.findByRole('link', { name: TRIP_TITLE });

    await user.click(screen.getByRole('button', { name: `Add a pro to ${TRIP_TITLE}` }));
    await user.type(screen.getByRole('textbox', { name: `New pro for ${TRIP_TITLE}` }), '   {Enter}');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: `Add a pro to ${TRIP_TITLE}` })).toBeInTheDocument(),
    );
    const { pros } = await notesOf(SEEDED_TRIP_ID);
    expect(pros.map((p) => p.text)).toEqual(['Flights are already booked']);
  });

  it('abandons the draft on Escape', async () => {
    const user = userEvent.setup();
    renderTrips();
    await screen.findByRole('link', { name: TRIP_TITLE });

    await user.click(screen.getByRole('button', { name: `Add a con to ${TRIP_TITLE}` }));
    await user.type(screen.getByRole('textbox', { name: `New con for ${TRIP_TITLE}` }), 'Not this{Escape}');

    expect(screen.queryByText('Not this')).not.toBeInTheDocument();
    const { cons } = await notesOf(SEEDED_TRIP_ID);
    expect(cons.map((c) => c.text)).toEqual(['Nothing sorted yet']);
  });

  it('removes a con and persists the remaining array', async () => {
    const user = userEvent.setup();
    renderTrips();
    await screen.findByText('Nothing sorted yet');

    await user.click(screen.getByRole('button', { name: 'Remove con: Nothing sorted yet' }));

    await waitFor(() => expect(screen.queryByText('Nothing sorted yet')).not.toBeInTheDocument());
    const { cons, pros } = await notesOf(SEEDED_TRIP_ID);
    expect(cons).toEqual([]);
    expect(pros).toHaveLength(1); // the other column is untouched
  });

  it('"Save for later" moves a trip out of the grid and into Saved for later', async () => {
    const user = userEvent.setup();
    renderTrips();
    await screen.findByRole('link', { name: TRIP_TITLE });

    await user.click(screen.getByRole('button', { name: `Save ${TRIP_TITLE} for later` }));

    const saved = await screen.findByRole('region', { name: 'Saved for later' });
    expect(within(saved).getByText(TRIP_TITLE)).toBeInTheDocument();
    expect(within(saved).getByRole('button', { name: 'Bring back' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: TRIP_TITLE })).not.toBeInTheDocument());
    // Set aside, never deleted.
    const { entry } = await api.get<{ entry: Entry }>(`/entries/${SEEDED_TRIP_ID}`);
    expect(entry.archived_at).not.toBeNull();
  });

  it('"Bring back" restores a saved trip to the grid', async () => {
    await api.delete(`/entries/${SEEDED_TRIP_ID}`);
    const user = userEvent.setup();
    renderTrips();

    await user.click(await screen.findByRole('button', { name: 'Bring back' }));

    expect(await screen.findByRole('link', { name: TRIP_TITLE })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Saved for later')).not.toBeInTheDocument());
  });

  it('keeps the library strip on first load', async () => {
    renderTrips();
    await screen.findByText('Fushimi Inari at dawn');

    const strip = await screen.findByRole('region', { name: 'Kept, not yet in a trip' });
    expect(within(strip).getByText('Fushimi Inari at dawn')).toBeInTheDocument();
    expect(within(strip).getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/library');
  });

  it('shows the brief empty-state copy when there are no trips', async () => {
    await api.delete(`/entries/${SEEDED_TRIP_ID}`);
    renderTrips();

    expect(
      await screen.findByText('No trips yet. A trip can start as one word — a country, a season, a craving.'),
    ).toBeInTheDocument();
  });

  it('opens the new-trip modal from "+ New trip" and lands on the trip it creates', async () => {
    const user = userEvent.setup();
    renderTrips();
    await screen.findByRole('link', { name: TRIP_TITLE });

    await user.click(screen.getByRole('button', { name: '+ New trip' }));
    expect(await screen.findByRole('heading', { name: 'New trip' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'Malaysia, sometime');
    await user.click(screen.getByRole('button', { name: 'Add trip' }));

    expect(await screen.findByText('Trip page')).toBeInTheDocument();
  });
});
