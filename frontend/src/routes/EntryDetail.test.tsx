import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../components/Toast';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { server } from '../mocks/server';
import { db, setRole } from '../mocks/db';
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
 * Seeded entry 1 — the trip itself, and the one kind of row the wire actually
 * populates `my_role` on. It is the fixture for the half of "may I destroy
 * this?" that a real role answers, where every idea above can only be answered
 * by authorship.
 */
const TRIP = { id: 1, title: 'Six days in Kyoto' };

/**
 * Who is asking. The seeded ideas were all written by user 1, so signing in as
 * them is what makes `created_by_me` true — and nothing in this file was signed
 * in at all before the destroy verb started needing to know. resetDb() in the
 * global afterEach signs back out.
 */
function signIn(userId: number) {
  db.currentUserId = userId;
}

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
    expect(read.getByText('Place')).toBeInTheDocument();
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
   * The dialog opened with a middle-dot summary — the kind, the place and how
   * long it takes — directly above the fields that say those same three things.
   * A panel whose whole job is the facts should not preview them.
   */
  it('does not summarise the facts above the fields that hold them', async () => {
    const panel = await openPanel('member');
    const read = within(panel);

    // The category is in exactly one place: the field that holds it. And
    // nothing anywhere in the panel strings facts together with a middle dot,
    // which is the shape any such summary would come back in.
    expect(read.getByRole('combobox', { name: 'Category' })).toHaveValue('place');
    expect(read.queryByText(/·/)).not.toBeInTheDocument();
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
 * plain nouns now, the same nouns on both surfaces — IdeaComposer.test.tsx
 * asserts the other half, where they are the capture card's aria-labels.
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
 * idea, in front of you". This panel is a centred <Modal> now (capture has
 * since moved inline, so the dialog it was matched to is gone), and it is
 * reached the same way from either side of the board: a row in the idea list
 * and a member in the bundle rail both hand their id to TripBoard's
 * `editingId`, which raises exactly this component (asserted from the caller's
 * side in BundleCard.test.tsx and IdeaRow.test.tsx).
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
 * Feedback #42: "when entered a url, it should be displayed as clickable link,
 * which should open in new tab when clicked. Eg: in todo item, but also in
 * description text etc."
 *
 * The notes box is where this panel invites a link — its own placeholder says
 * "a link to where you found it" — so the read side is where that link has to
 * become one. Only the facts a person wrote get it; the ones the app derived
 * are left alone, which is what the last test here pins.
 */
describe('EntryDetail — a URL in what someone wrote', () => {
  const SOURCE = 'https://kyoto-hours.example/fushimi-inari';
  const NOTES = `Opening hours are on ${SOURCE} — check before you go.`;

  function seedEntry5(patch: { title?: string; address?: string; notes?: string }) {
    const entry = db.entries.find((e) => e.id === IDEA.id);
    if (!entry) throw new Error('Seeded entry 5 has gone missing');
    Object.assign(entry, patch);
  }

  // resetDb() in the global afterEach puts the fixture back.
  beforeEach(() => seedEntry5({ notes: NOTES }));

  it('turns a URL in the notes into a link that opens in a new tab', async () => {
    const panel = await openPanel('viewer');
    const link = within(panel).getByRole('link', { name: SOURCE });

    expect(link).toHaveAttribute('href', SOURCE);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The sentence it sits in is unchanged, word for word.
    expect(link.parentElement?.textContent).toBe(NOTES);
  });

  /** A pasted link is an ordinary way to name an idea you captured off the web,
   * so the name is written text too. */
  it('links a URL pasted into the name as well', async () => {
    const named = 'https://ramen-alley.example';
    seedEntry5({ title: `Ramen alley ${named}` });
    const panel = await openPanel('viewer');

    expect(within(panel).getByRole('link', { name: named })).toHaveAttribute('href', named);
  });

  /** Editing is untouched: the box holds the raw text, because that is what
   * gets saved back. */
  it('leaves the raw text in the box for someone editing it', async () => {
    const panel = await openPanel('member');
    const read = within(panel);

    expect(read.getByRole('textbox', { name: 'Notes' })).toHaveValue(NOTES);
    expect(read.queryByRole('link', { name: SOURCE })).not.toBeInTheDocument();
  });

  it('renders a fact with no URL in it exactly as it was — no anchor, no wrapper', async () => {
    const panel = await openPanel('viewer');
    const description = within(panel).getByText('Saved from a friend’s trip report.');

    expect(description.querySelector('*')).toBeNull();
    expect(description.childNodes).toHaveLength(1);
  });

  /**
   * The address is written too — it is typed and hand-corrected like any other
   * sentence, and IdeaPanel linkifies the same field on the board, so the same
   * idea opened two ways has to read the same way.
   *
   * The coordinates it sits beside are the control: same row of the panel, and
   * they come out of the map rather than off a keyboard. The category and the
   * duration are the same case. None is wrapped, so each is still the single
   * bare text node it always was — which is what "structured facts never
   * linkify" has to mean in the DOM.
   */
  it('links a URL in the address, and leaves the facts nobody typed alone', async () => {
    const maps = 'https://maps.example/place/fushimi-inari';
    seedEntry5({ address: `68 Fukakusa Yabunouchicho — ${maps}` });
    const panel = await openPanel('viewer');
    const read = within(panel);

    expect(read.getByRole('link', { name: maps })).toHaveAttribute('href', maps);
    // Exactly two: this one and the one in the notes. Nothing else grew a link.
    expect(read.getAllByRole('link')).toHaveLength(2);

    for (const derived of ['Place', '34.9671', '135.7727']) {
      expect(read.getByText(derived).querySelector('*')).toBeNull();
    }
  });
});

/**
 * Set aside is a state with two ways out of it: pick it back up, or end it.
 * The note that describes the state is for everyone — that this was set aside
 * is part of what the entry says about itself — and only the verbs are gated.
 *
 * This screen is the detail view of the thing being destroyed, so the one
 * thing it has to do that no other surface does is leave: after the delete
 * there is no entry to be the detail of.
 */
describe('EntryDetail — deleting a set-aside idea for good', () => {
  /** resetDb() in the global afterEach puts the fixture back. */
  function setAside(id = IDEA.id) {
    const entry = db.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Seeded entry ${id} has gone missing`);
    entry.archived_at = new Date().toISOString();
  }

  // The demo user wrote the seeded ideas, so being them is what makes an idea
  // yours to destroy here — this screen asks for that positively now, rather
  // than reading a null role as "yours". The describe below is the other half:
  // who is refused, and why.
  beforeEach(() => signIn(1));

  it('offers it beside "Pick it back up" once the idea is set aside', async () => {
    setAside();
    const panel = await openPanel('member');
    const read = within(panel);

    expect(read.getByText('Set aside. It’s still here whenever you want it.')).toBeInTheDocument();
    expect(read.getByRole('button', { name: 'Pick it back up' })).toBeInTheDocument();
    expect(read.getByRole('button', { name: 'Delete for good' })).toBeInTheDocument();
  });

  /** The sentence survives, both verbs go: a viewer is told where the idea
   * stands and given nothing to do about it, which is how the rest of the
   * panel already reads to them. */
  it('tells a viewer the same thing and hands them neither verb', async () => {
    setAside();
    const panel = await openPanel('viewer');
    const read = within(panel);

    expect(read.getByText('Set aside. It’s still here whenever you want it.')).toBeInTheDocument();
    expect(read.queryByRole('button', { name: 'Pick it back up' })).not.toBeInTheDocument();
    expect(read.queryByRole('button', { name: 'Delete for good' })).not.toBeInTheDocument();
  });

  /** Step one first, everywhere. A live idea has no delete on it because the
   * whole note this button lives in is about being set aside. */
  it('is nowhere to be found on an idea that is still live', async () => {
    const panel = await openPanel('member');
    expect(within(panel).queryByRole('button', { name: 'Delete for good' })).not.toBeInTheDocument();
  });

  it('asks first, then leaves the screen it was the detail of', async () => {
    setAside();
    const onClose = vi.fn();
    const user = userEvent.setup();
    const panel = await openPanel('member', IDEA, onClose);

    await user.click(within(panel).getByRole('button', { name: 'Delete for good' }));

    // The refused attempt is the preview, so the panel is still open behind a
    // deletion that has not happened — and closing it is not one of the
    // answers on offer.
    expect(await screen.findByRole('dialog', { name: `Delete "${IDEA.title}" for good?` })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Yes, delete it/ }));

    // Staying here would be a detail screen for a row that no longer exists —
    // a refetch into "That one isn't here", which is the wrong sentence for
    // something you just deleted on purpose. The toast carries the news out.
    expect(await screen.findByText('Deleted for good.')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });
});

/**
 * The leak this closes, found in a browser pass: Anna, a viewer on the Japan
 * trip, opened /entries/:id on somebody else's set-aside idea and was offered
 * "Delete for good" — all the way into the confirmation, where the server
 * finally said no.
 *
 * Two defaults met. /entries/:id renders outside any <TripRoleProvider>, so
 * `useCanEdit()` returns the null role's answer, which is "yours, therefore
 * editable"; and `my_role` is null on every idea, so the entry could not
 * contradict it. Every case below therefore mounts a role that CAN edit — the
 * point is that the destroy verb no longer takes that as permission to destroy.
 *
 * The rest of the leak is deliberately still here and asserted: the edit form
 * and "Pick it back up" reach a viewer at this URL exactly as they did before
 * this feature existed. Teaching this route to resolve a real trip role is the
 * fix for that, and it is not one verb's worth of change.
 */
describe('EntryDetail — who is offered the destroy at /entries/:id', () => {
  function setAside(id: number) {
    const entry = db.entries.find((e) => e.id === id);
    if (!entry) throw new Error(`Seeded entry ${id} has gone missing`);
    entry.archived_at = new Date().toISOString();
  }

  /** Sarah did not write the seeded ideas, and holds no role on the trip. */
  const SOMEONE_ELSE = 2;

  it('refuses it to someone who neither wrote it nor holds a role on it', async () => {
    setAside(IDEA.id);
    signIn(SOMEONE_ELSE);
    const panel = await openPanel('member');
    const read = within(panel);

    expect(read.queryByRole('button', { name: 'Delete for good' })).not.toBeInTheDocument();
    // The state is still described, and the pre-existing leak is untouched:
    // the way back is still offered here, wrongly, as it was before.
    expect(read.getByText('Set aside. It’s still here whenever you want it.')).toBeInTheDocument();
    expect(read.getByRole('button', { name: 'Pick it back up' })).toBeInTheDocument();
  });

  /** Authorship is the one thing this screen can establish on an idea, and it
   * is enough on its own — the seeded ideas are the demo user's. */
  it('offers it to the person who wrote it', async () => {
    setAside(IDEA.id);
    signIn(1);
    const panel = await openPanel('member');

    expect(within(panel).getByRole('button', { name: 'Delete for good' })).toBeInTheDocument();
  });

  /**
   * A trip is the one row the wire fills `my_role` in on, so it is the one
   * place a real role can answer. Sarah did not create this trip — the button
   * is the role's doing and nothing else.
   */
  it('offers it on a trip where a real role allows it', async () => {
    setAside(TRIP.id);
    signIn(SOMEONE_ELSE);
    setRole(TRIP.id, SOMEONE_ELSE, 'owner');
    const panel = await openPanel('member', TRIP);

    expect(within(panel).getByRole('button', { name: 'Delete for good' })).toBeInTheDocument();
  });

  /** Same trip, same editable context, one different role — and a viewer's
   * role is a real answer, so it is the answer. */
  it('refuses it on a trip where a real role forbids it', async () => {
    setAside(TRIP.id);
    signIn(SOMEONE_ELSE);
    setRole(TRIP.id, SOMEONE_ELSE, 'viewer');
    const panel = await openPanel('member', TRIP);

    expect(within(panel).queryByRole('button', { name: 'Delete for good' })).not.toBeInTheDocument();
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

    // In at the name and out past the coordinates: seven blurs — name, short
    // description, category, duration, address, latitude, longitude — none of
    // them a change, the numeric fields included, which used to fire like the
    // rest. The seventh tab lands in the notes box, which the sentinel below
    // then genuinely edits.
    await user.click(read.getByRole('textbox', { name: 'Name' }));
    for (let i = 0; i < 7; i++) await user.tab();

    // Pinned, so that adding or removing a field makes the count wrong out
    // loud rather than quietly leaving the last field untabbed.
    expect(document.activeElement).toBe(read.getByRole('textbox', { name: 'Notes' }));

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

  /**
   * The address, deliberately, and not the notes box the two above end on: it
   * sits in the middle of the panel with fields on either side of it, so a body
   * carrying `address` and nothing else says both halves at once — the edit did
   * save, and the fields it was tabbed past on the way in and out stayed quiet.
   */
  it('still PATCHes a genuine change, and exactly that field', async () => {
    const patched = recordPatches();
    const user = userEvent.setup();
    const panel = await openPanel('member');
    const read = within(panel);

    const address = read.getByRole('textbox', { name: 'Address' });
    await user.clear(address);
    await user.type(address, 'Fushimi Inari, south gate');
    await user.tab();

    await waitFor(() => expect(patched).toEqual([{ address: 'Fushimi Inari, south gate' }]));
  });
});
