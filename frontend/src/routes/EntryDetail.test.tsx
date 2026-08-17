import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { EntryDetailModal } from './EntryDetail';
import type { TripRole } from '../api/types';

/**
 * Seeded entry 5 (src/mocks/db.ts) — the library idea. It is the right fixture
 * for this screen because it is half filled in: a description, a category, a
 * place, coordinates and a source link, and nothing at all under address, how
 * long it takes, or notes. Both halves of "what does a viewer see?" are in one
 * entry.
 */
const IDEA = { id: 5, title: 'Fushimi Inari at dawn' };

/**
 * Seeded entry 2 — the one two people have actually rated (+2 from Demo
 * Traveler, -1 from Sarah). Entry 5 has no votes at all, so the rating section
 * needs a second fixture to have anything to say.
 */
const RATED = { id: 2, title: 'Nanzen-ji' };

/** `role` mounts the provider TripLayout mounts in the app; null is the
 * no-trip-here case, which is editable on purpose (see tripRole.ts). */
function renderPanel(role: TripRole | null, entry = IDEA, onClose: () => void = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TripRoleProvider role={role}>
          <MemoryRouter>
            <EntryDetailModal entryId={entry.id} onClose={onClose} />
          </MemoryRouter>
        </TripRoleProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/**
 * The panel once its entry has arrived — the heading is the wait, because it
 * is the one thing that reads the same in both halves of the screen (while the
 * entry is in flight the dialog is titled "Opening"). Everything is then
 * asserted inside the dialog, which is portalled to the body and shares it with
 * the toasts.
 */
async function openPanel(role: TripRole | null, entry = IDEA, onClose?: () => void) {
  renderPanel(role, entry, onClose);
  await screen.findByRole('heading', { name: entry.title });
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
    const panel = await openPanel('viewer');

    expect(within(panel).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(panel).queryByRole('combobox')).not.toBeInTheDocument();
    // Belt and braces: the roles above would still be absent if a control were
    // merely hidden from assistive tech, and the point is that there is none.
    expect(panel.querySelectorAll('input, textarea, select')).toHaveLength(0);
  });

  it('still says everything the idea knows about itself', async () => {
    const panel = await openPanel('viewer');
    const read = within(panel);

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
    const panel = await openPanel('viewer');

    // Address, how long it takes, and notes — the three this idea never got.
    // A blank line under a label reads as something broken; a dash reads as a
    // fact nobody has filled in.
    expect(within(panel).getAllByText('—')).toHaveLength(3);
  });

  it('makes the source somewhere you can actually go', async () => {
    const panel = await openPanel('viewer');

    const link = within(panel).getByRole('link', { name: 'https://example.com/fushimi-inari' });
    expect(link).toHaveAttribute('href', 'https://example.com/fushimi-inari');
  });

  /**
   * The rating was the last locked-out form on the screen: five stops offered
   * and then refused. A viewer is not being asked, so the question goes and the
   * answer stays.
   */
  it('is told what everyone wants rather than asked what they want', async () => {
    const panel = await openPanel('viewer', RATED);
    const read = within(panel);

    expect(read.getByRole('heading', { name: 'How much everyone wants this' })).toBeInTheDocument();
    expect(read.queryByRole('heading', { name: 'How much do you want this?' })).not.toBeInTheDocument();
    expect(read.queryAllByRole('radio')).toHaveLength(0);
    expect(read.getByText('0.5 · 2 votes')).toBeInTheDocument();
  });

  it('says so plainly when nobody has rated it yet', async () => {
    const panel = await openPanel('viewer');
    expect(within(panel).getByText('No votes yet')).toBeInTheDocument();
  });

  /** The summary is the shape; this list is the substance of "votes others
   * submitted", and it is the same list for everyone. */
  it('still sees who said what, by name and score', async () => {
    const panel = await openPanel('viewer', RATED);
    const read = within(panel);

    expect(read.getByText('Demo Traveler')).toBeInTheDocument();
    expect(read.getByText('+2')).toBeInTheDocument();
    expect(read.getByText('Sarah')).toBeInTheDocument();
    expect(read.getByText('-1')).toBeInTheDocument();
  });

  it('offers neither way to move the idea', async () => {
    const panel = await openPanel('viewer');
    const read = within(panel);

    expect(read.queryByRole('button', { name: 'Make it a trip of its own' })).not.toBeInTheDocument();
    expect(read.queryByRole('button', { name: 'Move to Set aside' })).not.toBeInTheDocument();
  });
});

describe('EntryDetail — anyone who can edit', () => {
  it('still gets the fields, with what is already there in them', async () => {
    const panel = await openPanel('member');
    const read = within(panel);

    expect(read.getByRole('textbox', { name: 'What is it?' })).toHaveValue('Fushimi Inari at dawn');
    expect(read.getByRole('textbox', { name: 'Address' })).toHaveValue('');
    expect(read.getByRole('combobox', { name: 'What kind of thing?' })).toHaveValue('place');
  });

  it('is still asked the question, with the stops to answer it', async () => {
    const panel = await openPanel('member', RATED);
    const read = within(panel);

    expect(read.getByRole('heading', { name: 'How much do you want this?' })).toBeInTheDocument();
    expect(read.getAllByRole('radio')).toHaveLength(5);
    for (const stop of read.getAllByRole('radio')) expect(stop).toBeEnabled();
  });

  /**
   * Both labels name where the idea ends up rather than the motion that gets it
   * there, and this panel — unlike the board's ⋯ menu and its bulk bar — has
   * the room to say what that costs.
   */
  it('names both actions by what they leave you with, and says what each does', async () => {
    const panel = await openPanel('member');
    const read = within(panel);

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

/**
 * The feedback: an idea opened as a drawer off the right-hand edge while a new
 * idea opened as a centred dialog — two arrivals for what is one thing, "an
 * idea, in front of you". This panel is now the same <Modal> "Add an idea"
 * uses, and it is reached the same way from either side of the board: a row in
 * the idea list and a member in the bundle rail both hand their id to
 * TripBoard's `editingId`, which raises exactly this component (asserted from
 * the caller's side in BundleCard.test.tsx and IdeaRow.test.tsx).
 */
describe('EntryDetail — it opens as a modal', () => {
  it('gives the reader one way out in the footer, and it does not say Save', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const panel = await openPanel('member', IDEA, onClose);
    const read = within(panel);

    // Nothing is held back to commit — every field writes itself on blur — so a
    // Save/Cancel pair would be promising an undo this panel cannot give.
    expect(read.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(read.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await user.click(read.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  // A viewer gets the same one — they are finished reading rather than finished
  // editing, and it is the only footer button either of them sees. It is not
  // called "Close" because the dialog's own ✕ answers to that already, and two
  // buttons with one accessible name is one target too many to say out loud.
  it('gives a viewer the same single button, and does not duplicate the ✕', async () => {
    const panel = await openPanel('viewer');
    const read = within(panel);

    expect(read.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(read.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
  });

  it('closes on Escape, like every other dialog on the board', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    await openPanel('member', IDEA, onClose);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  /**
   * The wait is a dialog too. It used to be a drawer titled "Opening", and if
   * only the loaded state had moved the panel would jump from one edge of the
   * screen to the middle as the entry arrived.
   */
  it('is already the same dialog while the entry is still coming', () => {
    renderPanel('member');
    expect(screen.getByRole('dialog', { name: 'Opening' })).toBeInTheDocument();
  });
});
