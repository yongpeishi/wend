import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

/**
 * `/` is outside every trip, so there is no role provider here — each card reads
 * its own `my_role` off the trip it was handed. Which is the point: the grid can
 * hold a trip you own next to one you are only reading.
 */
describe('TripCard — what each role may do to it', () => {
  async function cardFor(role: Entry['my_role']) {
    const trip = await loadTrip();
    renderCard({ ...trip, my_role: role });
  }

  it('gives a viewer no rename and no way to set the trip aside', async () => {
    await cardFor('viewer');

    expect(screen.queryByRole('button', { name: `Rename ${TRIP_TITLE}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Save ${TRIP_TITLE} for later` })).not.toBeInTheDocument();
  });

  // Not rendered, not inert: the reasons are content and stay, the verbs around
  // them go. A disabled fieldset would have left both buttons standing there
  // greyed, which the house rule reads as "refused" rather than "not yours".
  it('takes the pros and cons controls away and leaves every reason readable', async () => {
    await cardFor('viewer');

    expect(screen.queryByRole('button', { name: `Add a pro to ${TRIP_TITLE}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Add a con to ${TRIP_TITLE}` })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove pro: Flights are already booked' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove con: Nothing sorted yet' }),
    ).not.toBeInTheDocument();

    // Both columns are still there, headings and notes alike.
    expect(screen.getByText('Pros')).toBeInTheDocument();
    expect(screen.getByText('Cons')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: `Pros for ${TRIP_TITLE}` })).getByText(
        'Flights are already booked',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: `Cons for ${TRIP_TITLE}` })).getByText('Nothing sorted yet'),
    ).toBeInTheDocument();
  });

  // The half that matters: the card is still the trip, fully readable.
  it('leaves a viewer the whole card to read', async () => {
    await cardFor('viewer');

    expect(screen.getByRole('link', { name: TRIP_TITLE })).toBeInTheDocument();
    const description = screen.getByRole('textbox', { name: `Description for ${TRIP_TITLE}` });
    expect(description).toHaveValue(TRIP_DESCRIPTION);
    // readOnly, not disabled — full contrast, still selectable and copyable.
    expect(description).toHaveAttribute('readonly');
    expect(description).toBeEnabled();
    expect(screen.getByText('Flights are already booked')).toBeInTheDocument();
    expect(screen.getByText('Nothing sorted yet')).toBeInTheDocument();
  });

  // A member may unmake their own work, not the trip everyone else is standing
  // on — so they rename and they do not archive.
  it('lets a member rename but not set the trip aside', async () => {
    await cardFor('member');

    expect(screen.getByRole('button', { name: `Rename ${TRIP_TITLE}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Save ${TRIP_TITLE} for later` })).not.toBeInTheDocument();
  });

  it('gives the owner both', async () => {
    await cardFor('owner');

    expect(screen.getByRole('button', { name: `Rename ${TRIP_TITLE}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Save ${TRIP_TITLE} for later` })).toBeInTheDocument();
  });

  // The other direction, so the test above can fail: an owner keeps every
  // pros/cons control the viewer lost.
  it('leaves an owner the whole pros and cons control', async () => {
    await cardFor('owner');

    expect(screen.getByRole('button', { name: `Add a pro to ${TRIP_TITLE}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Add a con to ${TRIP_TITLE}` })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove pro: Flights are already booked' }),
    ).toBeInTheDocument();
  });
});
