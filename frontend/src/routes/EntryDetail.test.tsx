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
 * Traveler, -1 from Sarah), and the one that sits inside a bundle. It is the
 * fixture for what this panel no longer shows: neither the rating nor the
 * bundles it appears in belong to a dialog about what the idea is.
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

  /**
   * The two moves left for the board's ⋯ menu, where Edit already lives. This
   * dialog is about what the idea IS; lifting it out or setting it aside is
   * something you do to it, and doing it from inside the panel that edits it
   * meant the panel had to explain itself twice.
   */
  it('offers neither way to move the idea either', async () => {
    const panel = await openPanel('member');
    const read = within(panel);

    expect(read.queryByRole('button', { name: 'Make it a trip of its own' })).not.toBeInTheDocument();
    expect(read.queryByRole('button', { name: 'Move to Set aside' })).not.toBeInTheDocument();
  });
});

/**
 * The feedback: the panel asked for the same things more than once and carried
 * a good deal that was not the idea. These are the four that went, and each is
 * asserted against the fixture that used to make it appear.
 */
describe('EntryDetail — what it no longer asks for', () => {
  /**
   * The dialog opened with "place · Fushimi Inari Taisha" directly above the
   * fields that say the kind, the place and how long it takes. A panel whose
   * whole job is the facts should not preview them.
   */
  it('does not summarise the facts above the fields that hold them', async () => {
    const panel = await openPanel('member');
    const read = within(panel);

    // The place is in exactly one place: its own field.
    expect(read.getByRole('textbox', { name: 'Where is it?' })).toHaveValue('Fushimi Inari Taisha');
    expect(read.queryByText('place · Fushimi Inari Taisha')).not.toBeInTheDocument();
  });

  /** One labelled box for one URL is a lot of panel for something most ideas
   * do not have — and the notes box was already the right home for it. */
  it('has no field for where you found it, and says in the notes that it goes there', async () => {
    const panel = await openPanel('member');
    const read = within(panel);

    expect(read.queryByRole('textbox', { name: 'Where did you find it?' })).not.toBeInTheDocument();
    expect(read.getByRole('textbox', { name: 'Notes' })).toHaveAttribute(
      'placeholder',
      expect.stringContaining('link to where you found it'),
    );
  });

  /** Entry 2 sits in a bundle, so this list had something to show. Which
   * bundles an idea is in is a board question, and the board answers it on the
   * row itself. */
  it('does not list the bundles the idea appears in', async () => {
    const panel = await openPanel('member', RATED);
    expect(within(panel).queryByRole('heading', { name: 'Appears in' })).not.toBeInTheDocument();
  });

  /** Entry 2 is the one two people rated, so the section had a tally, five
   * stops and a per-person list. None of it is a fact about the idea. */
  it('does not ask how much you want it, for either role', async () => {
    const asMember = await openPanel('member', RATED);
    expect(within(asMember).queryAllByRole('radio')).toHaveLength(0);
    expect(within(asMember).queryByText('0.5 · 2 votes')).not.toBeInTheDocument();
    expect(within(asMember).queryByText('Demo Traveler')).not.toBeInTheDocument();
  });

  it('does not show a viewer the tally either', async () => {
    const panel = await openPanel('viewer', RATED);
    const read = within(panel);

    expect(read.queryByRole('heading', { name: 'How much everyone wants this' })).not.toBeInTheDocument();
    expect(read.queryByText('0.5 · 2 votes')).not.toBeInTheDocument();
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
