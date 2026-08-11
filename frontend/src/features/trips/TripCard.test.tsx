import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { api } from '../../api';
import { TripCard } from './TripCard';
import type { Entry } from '../../api/types';

// The seeded trip (src/mocks/db.ts): "Six days in Kyoto", with a description
// already set, so save-vs-no-op and blank-reverts can both be exercised.
const SEEDED_TRIP_ID = 1;
const TRIP_TITLE = 'Six days in Kyoto';
const TRIP_DESCRIPTION = 'Temples, rivers, and slow mornings.';

async function loadTrip(): Promise<Entry> {
  const { entry } = await api.get<{ entry: Entry }>(`/entries/${SEEDED_TRIP_ID}`);
  return entry;
}

function renderCard(trip: Entry, onArchive: () => void = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <TripCard trip={trip} onArchive={onArchive} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TripCard', () => {
  it('renders the title as a working link to the trip when not editing', async () => {
    renderCard(await loadTrip());

    const link = screen.getByRole('link', { name: TRIP_TITLE });
    expect(link).toHaveAttribute('href', `/trips/${SEEDED_TRIP_ID}`);
  });

  it('reveals an editable title input via the rename button, in place of the link', async () => {
    const user = userEvent.setup();
    renderCard(await loadTrip());

    await user.click(screen.getByRole('button', { name: `Rename ${TRIP_TITLE}` }));

    expect(screen.queryByRole('link', { name: TRIP_TITLE })).not.toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: `Trip name for ${TRIP_TITLE}` });
    expect(input).toHaveValue(TRIP_TITLE);
  });

  it('saves a new title on blur and shows the link again', async () => {
    const user = userEvent.setup();
    renderCard(await loadTrip());

    await user.click(screen.getByRole('button', { name: `Rename ${TRIP_TITLE}` }));
    const input = screen.getByRole('textbox', { name: `Trip name for ${TRIP_TITLE}` });
    await user.clear(input);
    await user.type(input, 'Kyoto in autumn');
    await user.tab();

    expect(await screen.findByRole('link', { name: 'Kyoto in autumn' })).toBeInTheDocument();
    await waitFor(async () => expect((await loadTrip()).title).toBe('Kyoto in autumn'));
  });

  it('saves a new title on Enter', async () => {
    const user = userEvent.setup();
    renderCard(await loadTrip());

    await user.click(screen.getByRole('button', { name: `Rename ${TRIP_TITLE}` }));
    const input = screen.getByRole('textbox', { name: `Trip name for ${TRIP_TITLE}` });
    await user.clear(input);
    await user.type(input, 'Kyoto, take two{Enter}');

    expect(await screen.findByRole('link', { name: 'Kyoto, take two' })).toBeInTheDocument();
    await waitFor(async () => expect((await loadTrip()).title).toBe('Kyoto, take two'));
  });

  it('does not save a blank title, reverting to the original instead', async () => {
    const user = userEvent.setup();
    renderCard(await loadTrip());

    await user.click(screen.getByRole('button', { name: `Rename ${TRIP_TITLE}` }));
    const input = screen.getByRole('textbox', { name: `Trip name for ${TRIP_TITLE}` });
    await user.clear(input);
    await user.tab();

    expect(await screen.findByRole('link', { name: TRIP_TITLE })).toBeInTheDocument();
    const trip = await loadTrip();
    expect(trip.title).toBe(TRIP_TITLE);
  });

  it('cancels an in-progress rename on Escape without saving', async () => {
    const user = userEvent.setup();
    renderCard(await loadTrip());

    await user.click(screen.getByRole('button', { name: `Rename ${TRIP_TITLE}` }));
    const input = screen.getByRole('textbox', { name: `Trip name for ${TRIP_TITLE}` });
    await user.clear(input);
    await user.type(input, 'Something I changed my mind about{Escape}');

    expect(await screen.findByRole('link', { name: TRIP_TITLE })).toBeInTheDocument();
    const trip = await loadTrip();
    expect(trip.title).toBe(TRIP_TITLE);
  });

  it('shows the description in an always-editable textarea and saves changes on blur', async () => {
    const user = userEvent.setup();
    renderCard(await loadTrip());

    const textarea = screen.getByRole('textbox', { name: `Description for ${TRIP_TITLE}` });
    expect(textarea).toHaveValue(TRIP_DESCRIPTION);

    await user.clear(textarea);
    await user.type(textarea, 'Slower this time.');
    await user.tab();

    await waitFor(async () => expect((await loadTrip()).description).toBe('Slower this time.'));
  });

  it('saves a cleared description as null', async () => {
    const user = userEvent.setup();
    renderCard(await loadTrip());

    const textarea = screen.getByRole('textbox', { name: `Description for ${TRIP_TITLE}` });
    await user.clear(textarea);
    await user.tab();

    await waitFor(async () => expect((await loadTrip()).description).toBeNull());
  });

  it('keeps the archive button working alongside the new rename control', async () => {
    const user = userEvent.setup();
    let archived = false;
    renderCard(await loadTrip(), () => {
      archived = true;
    });

    await user.click(screen.getByRole('button', { name: `Save ${TRIP_TITLE} for later` }));
    expect(archived).toBe(true);
  });
});
