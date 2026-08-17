import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { EntryDetailDrawer } from './EntryDetail';
import type { TripRole } from '../api/types';

/**
 * Seeded entry 5 (src/mocks/db.ts) — the library idea. It is the right fixture
 * for this screen because it is half filled in: a description, a category, a
 * place, coordinates and a source link, and nothing at all under address, how
 * long it takes, or notes. Both halves of "what does a viewer see?" are in one
 * entry.
 */
const IDEA = 5;

/** `role` mounts the provider TripLayout mounts in the app; null is the
 * no-trip-here case, which is editable on purpose (see tripRole.ts). */
function renderDrawer(role: TripRole | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TripRoleProvider role={role}>
          <MemoryRouter>
            <EntryDetailDrawer entryId={IDEA} onClose={() => {}} />
          </MemoryRouter>
        </TripRoleProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/**
 * The drawer once its entry has arrived — the heading is the wait, because it
 * is the one thing that reads the same in both halves of the screen (while the
 * entry is in flight the drawer is titled "Opening"). Everything is then
 * asserted inside the drawer, which is portalled to the body and shares it with
 * the toasts.
 */
async function openDrawer(role: TripRole | null) {
  renderDrawer(role);
  await screen.findByRole('heading', { name: 'Fushimi Inari at dawn' });
  return screen.getByRole('dialog');
}

/**
 * The complaint this answers: a viewer was given the whole panel as ten
 * labelled boxes with `readOnly` and `disabled` set — a form they were locked
 * out of, which says "you may not" much louder than it says what the idea is.
 * The facts are the same; only their form changes.
 */
describe('EntryDetail — a viewer reads it', () => {
  it('offers nothing to fill in — not a disabled box, no box at all', async () => {
    const drawer = await openDrawer('viewer');

    expect(within(drawer).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(drawer).queryByRole('combobox')).not.toBeInTheDocument();
    // Belt and braces: the roles above would still be absent if a control were
    // merely hidden from assistive tech, and the point is that there is none.
    expect(drawer.querySelectorAll('input, textarea, select')).toHaveLength(0);
  });

  it('still says everything the idea knows about itself', async () => {
    const drawer = await openDrawer('viewer');
    const read = within(drawer);

    // The label names the fact and the text under it answers, exactly as the
    // fields did.
    expect(read.getByText('What is it?')).toBeInTheDocument();
    expect(read.getAllByText('Fushimi Inari at dawn').length).toBeGreaterThan(0);
    expect(read.getByText('Saved from a friend’s trip report.')).toBeInTheDocument();
    expect(read.getByText('place')).toBeInTheDocument();
    expect(read.getByText('Fushimi Inari Taisha')).toBeInTheDocument();
    expect(read.getByText('34.9671')).toBeInTheDocument();
    expect(read.getByText('135.7727')).toBeInTheDocument();
  });

  it('says so quietly where nothing has been filled in, rather than leaving a gap', async () => {
    const drawer = await openDrawer('viewer');

    // Address, how long it takes, and notes — the three this idea never got.
    // A blank line under a label reads as something broken; a dash reads as a
    // fact nobody has filled in.
    expect(within(drawer).getAllByText('—')).toHaveLength(3);
  });

  it('makes the source somewhere you can actually go', async () => {
    const drawer = await openDrawer('viewer');

    const link = within(drawer).getByRole('link', { name: 'https://example.com/fushimi-inari' });
    expect(link).toHaveAttribute('href', 'https://example.com/fushimi-inari');
  });

  it('keeps the rating readable while leaving it unvotable', async () => {
    const drawer = await openDrawer('viewer');

    const stops = within(drawer).getAllByRole('radio');
    expect(stops).toHaveLength(5);
    for (const stop of stops) expect(stop).toBeDisabled();
  });

  it('offers neither way to move the idea', async () => {
    const drawer = await openDrawer('viewer');
    const read = within(drawer);

    expect(read.queryByRole('button', { name: 'Make it a trip of its own' })).not.toBeInTheDocument();
    expect(read.queryByRole('button', { name: 'Move to Set aside' })).not.toBeInTheDocument();
  });
});

describe('EntryDetail — anyone who can edit', () => {
  it('still gets the fields, with what is already there in them', async () => {
    const drawer = await openDrawer('member');
    const read = within(drawer);

    expect(read.getByRole('textbox', { name: 'What is it?' })).toHaveValue('Fushimi Inari at dawn');
    expect(read.getByRole('textbox', { name: 'Address' })).toHaveValue('');
    expect(read.getByRole('combobox', { name: 'What kind of thing?' })).toHaveValue('place');
  });

  /**
   * Both labels name where the idea ends up rather than the motion that gets it
   * there, and the drawer — unlike the board's ⋯ menu and its bulk bar — has
   * the room to say what that costs.
   */
  it('names both actions by what they leave you with, and says what each does', async () => {
    const drawer = await openDrawer('member');
    const read = within(drawer);

    expect(read.getByRole('button', { name: 'Make it a trip of its own' })).toBeInTheDocument();
    expect(
      read.getByText('Takes it off this trip. It keeps everything it has and gets a board of its own.'),
    ).toBeInTheDocument();

    expect(read.getByRole('button', { name: 'Move to Set aside' })).toBeInTheDocument();
    expect(
      read.getByText(
        'Stays on this trip, out of the idea list. The Set aside list at the foot of the board brings it back.',
      ),
    ).toBeInTheDocument();
  });
});
