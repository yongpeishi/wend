import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../components/Toast';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { server } from '../mocks/server';
import { EntryDetailModal } from './EntryDetail';
import type { TripRole } from '../api/types';

/**
 * Seeded entry 5 (src/mocks/db.ts) — the library idea. It is the right fixture
 * for this screen because it is half filled in: a short description, a
 * category and coordinates, and nothing at all under address,
 * estimated duration or notes. Both halves of "what does a viewer see?" are in
 * one entry.
 */
const IDEA = { id: 5, title: 'Fushimi Inari at dawn' };

/**
 * Seeded entry 2 — the one two people have actually rated (+2 from Demo
 * Traveler, -1 from Sarah), the one that sits inside a bundle, and the one
 * carrying an open todo ("Check opening hours"). It is the fixture for
 * everything this panel no longer shows: none of the rating, the bundles it
 * appears in, or the checklist belongs to a dialog about what the idea is.
 */
const RATED = { id: 2, title: 'Nanzen-ji' };

/**
 * What the dialog is called, which now depends on what you can do with it. It
 * is no longer the entry's own title — see the note in EntryDetail.tsx about
 * the name having been on screen twice.
 */
function headingFor(role: TripRole | null) {
  return role === 'viewer' ? 'Idea' : 'Edit idea';
}

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
 * The panel once its entry has arrived. The heading is still the wait — while
 * the entry is in flight the dialog is titled "Opening", so "Edit idea" or
 * "Idea" appearing is exactly the moment the entry landed. Everything is then
 * asserted inside the dialog, which is portalled to the body and shares it with
 * the toasts.
 */
async function openPanel(role: TripRole | null, entry = IDEA, onClose?: () => void) {
  renderPanel(role, entry, onClose);
  await screen.findByRole('heading', { name: headingFor(role) });
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
    expect(read.getByText('Name')).toBeInTheDocument();
    expect(read.getAllByText('Fushimi Inari at dawn').length).toBeGreaterThan(0);
    expect(read.getByText('Saved from a friend’s trip report.')).toBeInTheDocument();
    expect(read.getByText('place')).toBeInTheDocument();
    expect(read.getByText('34.9671')).toBeInTheDocument();
    expect(read.getByText('135.7727')).toBeInTheDocument();
  });

  it('says so quietly where nothing has been filled in, rather than leaving a gap', async () => {
    const panel = await openPanel('viewer');

    // Address, estimated duration and notes — the three this idea never got.
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

    expect(read.getByRole('textbox', { name: 'Name' })).toHaveValue('Fushimi Inari at dawn');
    expect(read.getByRole('textbox', { name: 'Address' })).toHaveValue('');
    expect(read.getByRole('combobox', { name: 'Category' })).toHaveValue('place');
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

    // The summary line is gone; the kind is only ever read off its own field.
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

  /** Entry 2 carries an open todo, so this section had something to draw. The
   * checklist screen owns todos; this was a read-only echo of it. */
  it('does not list the idea’s todos', async () => {
    const panel = await openPanel('member', RATED);
    const read = within(panel);

    expect(read.queryByRole('heading', { name: 'To do' })).not.toBeInTheDocument();
    expect(read.queryByText('Check opening hours')).not.toBeInTheDocument();
  });
});

/**
 * The feedback: the labels asked questions — "What is it?", "What kind of
 * thing?" — which read as friendly once and as noise every time after that,
 * and the two forms phrased the same question two different ways. They are
 * plain nouns now, the same nouns on both surfaces (NewIdeaModal.test.tsx
 * asserts the other half).
 */
describe('EntryDetail — the fields are named, not asked', () => {
  const LABELS = ['Name', 'Short description', 'Category', 'Estimated duration', 'Notes'];

  it('labels every field with a noun, for someone editing', async () => {
    const panel = await openPanel('member');
    const read = within(panel);

    for (const label of LABELS) expect(read.getByText(label)).toBeInTheDocument();
    for (const asked of ['What is it?', 'What kind of thing?', 'How long does it take?', 'Where is it?', 'Anything worth remembering?']) {
      expect(read.queryByText(asked)).not.toBeInTheDocument();
    }
  });

  /** The read-only half must say the same words as the editable one — they are
   * the same facts, and a viewer being given different labels would mean the
   * two halves had drifted. */
  it('gives a viewer the identical set of labels', async () => {
    const panel = await openPanel('viewer');
    const read = within(panel);

    for (const label of LABELS) expect(read.getByText(label)).toBeInTheDocument();
  });

  /**
   * The description used to sit below the coordinates, which put a latitude
   * between an idea and the sentence describing it. It reads directly after
   * the name now, in both halves.
   */
  it('puts the short description directly after the name', async () => {
    const panel = await openPanel('member');
    const order = Array.from(panel.querySelectorAll('label')).map((l) => l.textContent?.trim());

    expect(order.slice(0, 2)).toEqual(['Name', 'Short description']);
  });

  it('puts it there for a viewer too', async () => {
    const panel = await openPanel('viewer');
    const order = Array.from(panel.querySelectorAll('label')).map((l) => l.textContent?.trim());

    expect(order.slice(0, 2)).toEqual(['Name', 'Short description']);
  });
});

/**
 * The heading used to be the entry's own title, which put the name on screen
 * twice — once above the dialog and again in the field you edit it in, the
 * second disagreeing with the first for as long as you were mid-word. It now
 * says what the dialog is for.
 */
describe('EntryDetail — what the dialog calls itself', () => {
  it('is called "Edit idea" for someone who can edit, and does not repeat the name', async () => {
    const panel = await openPanel('member');
    const read = within(panel);

    expect(read.getByRole('heading', { name: 'Edit idea' })).toBeInTheDocument();
    expect(read.queryByRole('heading', { name: 'Fushimi Inari at dawn' })).not.toBeInTheDocument();
    // The name is still there once, in the field that owns it.
    expect(read.getByRole('textbox', { name: 'Name' })).toHaveValue('Fushimi Inari at dawn');
  });

  /** "Edit idea" would be a lie to someone who cannot edit — they are reading
   * it, and the heading says so. */
  it('is called "Idea" for a viewer, who is not editing anything', async () => {
    const panel = await openPanel('viewer');
    const read = within(panel);

    expect(read.getByRole('heading', { name: 'Idea' })).toBeInTheDocument();
    expect(read.queryByRole('heading', { name: 'Edit idea' })).not.toBeInTheDocument();
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

/**
 * Every PATCH body the panel sends, in arrival order. The real handler is
 * stood aside because what is on trial here is whether a blur earns a request
 * at all, not what the server does with one.
 */
function recordPatches() {
  const patched: Array<Record<string, unknown>> = [];
  server.use(
    http.patch('/api/entries/:id', async ({ params, request }) => {
      const body = (await request.json()) as { entry?: Record<string, unknown> };
      patched.push(body.entry ?? {});
      return HttpResponse.json({ entry: { id: Number(params.id), ...body.entry } });
    }),
  );
  return patched;
}

/**
 * The feedback: every field saved itself on blur whether or not anything had
 * changed — tabbing through the panel to read it fired a PATCH-and-refetch
 * cycle per field — and a numeric typo was worse than wasteful: "12.5.6"
 * parses to NaN, NaN serializes to null, and the stored coordinate was
 * silently wiped. Only a real change PATCHes now, and a typo is refused with
 * the stored value put back in the box.
 *
 * Each negative ends with one genuine edit; its PATCH arriving proves the
 * quiet blurs before it stayed quiet, rather than merely not having landed yet.
 */
describe('EntryDetail — what blur actually saves', () => {
  const SENTINEL = 'Go before the tour buses.';

  it('does not PATCH a field you only tabbed through', async () => {
    const patched = recordPatches();
    const user = userEvent.setup();
    const panel = await openPanel('member');
    const read = within(panel);

    // In at the name and out past the coordinates: eight blurs, none of them
    // a change — the numeric fields included, which used to fire like the rest.
    await user.click(read.getByRole('textbox', { name: 'Name' }));
    for (let i = 0; i < 8; i++) await user.tab();

    await user.type(read.getByRole('textbox', { name: 'Notes' }), SENTINEL);
    await user.tab();

    await waitFor(() => expect(patched).toEqual([{ notes: SENTINEL }]));
  });

  it('refuses a numeric typo and puts the stored value back', async () => {
    const patched = recordPatches();
    const user = userEvent.setup();
    const panel = await openPanel('member');
    const read = within(panel);

    const lat = read.getByRole('textbox', { name: 'Latitude' });
    await user.clear(lat);
    await user.type(lat, '12.5.6');
    await user.tab();

    // The box shows what is actually stored again, not the typo it never saved.
    expect(lat).toHaveValue('34.9671');

    await user.type(read.getByRole('textbox', { name: 'Notes' }), SENTINEL);
    await user.tab();

    await waitFor(() => expect(patched).toEqual([{ notes: SENTINEL }]));
  });

  it('still PATCHes a genuine change, and exactly that field', async () => {
    const patched = recordPatches();
    const user = userEvent.setup();
    const panel = await openPanel('member');
    const read = within(panel);

    const notes = read.getByRole('textbox', { name: 'Notes' });
    await user.clear(notes);
    await user.type(notes, 'Something else');
    await user.tab();

    await waitFor(() => expect(patched).toEqual([{ notes: 'Something else' }]));
  });
});
