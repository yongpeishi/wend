import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../../components/Toast';
import { IdeaRow } from './IdeaRow';
import { api } from '../../api';
import { server } from '../../mocks/server';
import type { Entry } from '../../api/types';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 42,
    kind: 'idea',
    title: 'Fushimi Inari',
    description: null,
    category: 'place',
    starts_on: null,
    ends_on: null,
    location_name: 'Kyoto south',
    address: null,
    lat: null,
    lng: null,
    duration_minutes: 120,
    source_url: null,
    notes: null,
    from_entry_id: null,
    to_entry_id: null,
    pros: [],
    cons: [],
    archived_at: null,
    created_at: '',
    updated_at: '',
    parent_ids: [],
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 4, count: 2, average: 2 },
    my_vote: 2,
    scheduled: false,
    ...overrides,
  };
}

const PLAN = makeEntry({ id: 90, kind: 'bundle', title: 'Tuesday south', category: null, location_name: null });

interface RowOptions {
  entry?: Entry;
  bundles?: Entry[];
  members?: Map<number, Entry[]>;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number, shiftKey: boolean) => void;
  onEdit?: (id: number) => void;
  onToast?: (message: string) => void;
  canEdit?: boolean;
  insideCount?: number;
  otherParents?: string[];
  onDrill?: (id: number) => void;
  /** Pins the CONTROLLED expanded prop. With `onToggleExpand`, turns the
      harness's stand-in board off entirely. */
  expanded?: boolean;
  onToggleExpand?: (id: number) => void;
}

/**
 * Expansion is controlled from the board now, so the row alone cannot open on
 * a click. This harness is the two lines of board the row needs to be usable
 * in a test: it holds `expandedId` and flips it on toggle — unless the test
 * pins `expanded`/`onToggleExpand` itself to prove the row obeys rather than
 * remembers.
 */
function HarnessRow({ options }: { options: RowOptions }) {
  const entry = options.entry ?? makeEntry({});
  const [openId, setOpenId] = useState<number | null>(options.expanded ? entry.id : null);
  const controlled = options.expanded !== undefined || options.onToggleExpand !== undefined;
  return (
    <IdeaRow
      entry={entry}
      bundles={options.bundles ?? []}
      members={options.members ?? new Map()}
      selectMode={options.selectMode ?? false}
      selected={options.selected ?? false}
      onToggleSelect={options.onToggleSelect ?? (() => {})}
      onEdit={options.onEdit}
      onToast={options.onToast}
      canEdit={options.canEdit}
      insideCount={options.insideCount ?? 0}
      otherParents={options.otherParents ?? []}
      onDrill={options.onDrill ?? (() => {})}
      expanded={controlled ? (options.expanded ?? false) : openId === entry.id}
      onToggleExpand={
        options.onToggleExpand ?? ((id) => setOpenId((current) => (current === id ? null : id)))
      }
    />
  );
}

function rowTree(options: RowOptions, queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/board']}>
        <ToastProvider>
          <DndContext>
            <Routes>
              <Route path="/board" element={<HarnessRow options={options} />} />
              <Route path="/entries/:id" element={<p>Entry detail screen</p>} />
            </Routes>
          </DndContext>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderRow(options: RowOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(rowTree(options, queryClient));
  return {
    ...view,
    /** Re-renders the same row with new props — for "does it follow the data?". */
    update: (next: RowOptions) => view.rerender(rowTree(next, queryClient)),
  };
}

/** The row's own disclosure button — the title and its words in one target. */
function rowToggle() {
  return screen.getByRole('button', { name: /^Fushimi Inari/ });
}

/** Expands the row and hands back the user-event session. */
async function expandRow() {
  const user = userEvent.setup();
  await user.click(rowToggle());
  return user;
}

/** Opens the ⋯ menu — which sits at the open row's top right now. */
async function openActions() {
  const user = await expandRow();
  await user.click(screen.getByRole('button', { name: 'Actions for Fushimi Inari' }));
  return user;
}

describe('IdeaRow — what the closed row says', () => {
  it('shows the title and nothing descriptive — the pitch lives inside now', () => {
    renderRow();
    const row = rowToggle();
    expect(row).toHaveTextContent('Fushimi Inari');
    // The old meta line (place · duration) and the category word moved into
    // the panel; the closed row is title, tick and pills only.
    expect(row.textContent).not.toContain('2 hr');
    expect(row.textContent).not.toContain('Kyoto south');
    expect(row.textContent).not.toContain('Place');
  });

  it('says "✓ on a day" once the idea is scheduled, and nothing before', () => {
    const view = renderRow();
    expect(screen.queryByText('✓ on a day')).not.toBeInTheDocument();

    view.update({ entry: makeEntry({ scheduled: true }) });
    expect(screen.getByText('✓ on a day')).toBeInTheDocument();
  });

  it('carries the tally as a "▲ N" pill when anyone is keen', () => {
    renderRow({ entry: makeEntry({ vote_tally: { total: 5, count: 3, average: 1.67 } }) });
    expect(screen.getByText('▲ 5')).toBeInTheDocument();
  });

  it('spells the scale out for anyone who wonders what the number is', () => {
    renderRow();
    expect(screen.getByTitle("Everyone's votes added up, from +2 to -2 each")).toBeInTheDocument();
  });

  it('draws no scoreboard on an idea nobody has judged — zero or worse', () => {
    const view = renderRow({ entry: makeEntry({ vote_tally: { total: 0, count: 0, average: 0 } }) });
    expect(screen.queryByText(/^▲/)).not.toBeInTheDocument();

    view.update({ entry: makeEntry({ vote_tally: { total: -2, count: 2, average: -1 } }) });
    expect(screen.queryByText(/^▲/)).not.toBeInTheDocument();
  });

  it('names the other levels the idea also lives in, as one muted chip', () => {
    renderRow({ otherParents: ['Kyoto day', 'Food crawl'] });
    expect(screen.getByText('also in: Kyoto day · Food crawl')).toBeInTheDocument();
  });

  it('says nothing about elsewhere when there is no elsewhere', () => {
    renderRow({ otherParents: [] });
    expect(screen.queryByText(/^also in:/)).not.toBeInTheDocument();
  });
});

/**
 * "N inside ›" is the one click on the closed row that goes somewhere else —
 * down into the idea's own list — so it is its own button, outside the
 * disclosure, and it must never also unfold the row it is leaving.
 */
describe('IdeaRow — drilling in', () => {
  it('offers the way down as a pill once anything lives inside', () => {
    renderRow({ insideCount: 3 });
    expect(screen.getByRole('button', { name: '3 inside ›' })).toBeInTheDocument();
  });

  it('offers no way down from a leaf', () => {
    renderRow({ insideCount: 0 });
    expect(screen.queryByRole('button', { name: /inside/ })).not.toBeInTheDocument();
  });

  it('drills on click, and does not open the row it is leaving', async () => {
    const user = userEvent.setup();
    const onDrill = vi.fn();
    const onToggleExpand = vi.fn();
    renderRow({ insideCount: 3, onDrill, onToggleExpand });

    await user.click(screen.getByRole('button', { name: '3 inside ›' }));

    expect(onDrill).toHaveBeenCalledWith(42);
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it('offers the same descent from inside the open row', async () => {
    const onDrill = vi.fn();
    renderRow({ insideCount: 3, onDrill });
    const user = await expandRow();

    await user.click(screen.getByRole('button', { name: 'Open 3 inside' }));

    expect(onDrill).toHaveBeenCalledWith(42);
  });

  it('keeps the panel free of a descent that leads nowhere', async () => {
    renderRow({ insideCount: 0 });
    await expandRow();

    expect(screen.queryByRole('button', { name: /^Open .* inside$/ })).not.toBeInTheDocument();
  });
});

/**
 * Clicking a row used to throw the edit drawer over the board, then to flip
 * local state. It now ASKS — expansion is controlled, because the board opens
 * one row at a time and closes it when the level changes.
 */
describe('IdeaRow — opening the row', () => {
  it('reports the click and obeys the prop, rather than remembering', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({ expanded: false, onToggleExpand });

    await user.click(rowToggle());

    expect(onToggleExpand).toHaveBeenCalledWith(42);
    // The prop still says closed, so the row stays closed — no shadow state.
    expect(rowToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('is open exactly when the board says so', () => {
    renderRow({ expanded: true });
    expect(rowToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('To-do')).toBeInTheDocument();
  });

  it('opens on a click and closes on the next one, under a board that listens', async () => {
    renderRow();
    const user = await expandRow();

    expect(rowToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('To-do')).toBeInTheDocument();

    await user.click(rowToggle());

    expect(rowToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('To-do')).not.toBeInTheDocument();
  });

  it('starts closed, with nothing of the panel on the page', () => {
    renderRow();

    expect(rowToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('names the panel it controls, so the disclosure is more than a visual', async () => {
    renderRow();
    await expandRow();

    const panelId = rowToggle().getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).toBeInTheDocument();
  });

  it('does not open the editor when the row is clicked — that is the ⋯ menu’s job now', async () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });
    const user = userEvent.setup();

    await user.click(rowToggle());

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByText('Entry detail screen')).not.toBeInTheDocument();
    expect(rowToggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the idea’s own words once it is open, description and notes both', async () => {
    renderRow({
      entry: makeEntry({ description: 'Thousand torii gates up the hill.', notes: 'Go before eight.' }),
    });
    await expandRow();

    expect(screen.getByText('Thousand torii gates up the hill.')).toBeInTheDocument();
    expect(screen.getByText('Go before eight.')).toBeInTheDocument();
  });

  it('shows the address once it is open, which left the closed row', async () => {
    renderRow({ entry: makeEntry({ address: '68 Fukakusa Yabunouchicho' }) });
    await expandRow();

    expect(screen.getByText('68 Fukakusa Yabunouchicho')).toBeInTheDocument();
  });

  // The chip qualifies the name, so it sits in the title line rather than
  // being filed lower down in the panel with the other facts.
  it('puts the category beside the title once it is open', async () => {
    renderRow();
    await expandRow();

    expect(rowToggle()).toHaveTextContent('Place');
  });

  // The panel is a sibling of the toggle, not a child of it. If that ever
  // changes, every click inside would bubble up and shut the row.
  it('does not close when something inside the panel is used', async () => {
    renderRow();
    const user = await expandRow();

    await user.click(screen.getByRole('radio', { name: 'Keen' }));

    expect(rowToggle()).toHaveAttribute('aria-expanded', 'true');
  });
});

const VOTED = makeEntry({
  my_vote: 2,
  vote_tally: {
    total: 1,
    count: 2,
    average: 0.5,
    voters: [
      { user_id: 1, user_name: 'Demo Traveler', score: 2 },
      { user_id: 2, user_name: 'Sarah', score: -1 },
    ],
  },
});

/**
 * The signed-in user votes from the open row, sees who else has, and the pill
 * moves under their hand — `useVote` writes `my_vote` optimistically, so the
 * stop fills before the request has landed.
 */
describe('IdeaRow — voting from the open row', () => {
  it('offers the five stops once the row is open, and marks the one you picked', async () => {
    renderRow({ entry: VOTED });
    await expandRow();

    expect(screen.getByRole('radiogroup', { name: 'How keen are you on Fushimi Inari?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Really keen' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Not keen' })).toHaveAttribute('aria-checked', 'false');
  });

  it('puts the score that was picked, at the entry it belongs to', async () => {
    const sent: unknown[] = [];
    server.use(
      http.put('/api/entries/42/vote', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({
          vote: { id: 9, entry_id: 42, user_id: 1, user_name: 'Demo Traveler', score: -1 },
          tally: { total: -2, count: 2, average: -1 },
        });
      }),
    );
    renderRow({ entry: VOTED });
    const user = await expandRow();

    await user.click(screen.getByRole('radio', { name: 'Not keen' }));

    await waitFor(() => expect(sent).toEqual([{ score: -1 }]));
  });

  /**
   * Where "immediately" is actually asserted. `useVote` writes `my_vote` into
   * every cached `entries` payload before the request resolves (proven in
   * api/votes.test.tsx), and the board hands this row the entry it read out of
   * that cache — so what has to hold HERE is that the row follows the entry it
   * is given, rather than latching the vote it first rendered with.
   */
  it('follows the entry it is handed, so the optimistic vote shows the moment it is written', async () => {
    const view = renderRow({ entry: VOTED });
    await expandRow();
    expect(screen.getByRole('radio', { name: 'Really keen' })).toHaveAttribute('aria-checked', 'true');

    view.update({ entry: makeEntry({ ...VOTED, my_vote: -1 }) });

    expect(screen.getByRole('radio', { name: 'Not keen' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Really keen' })).toHaveAttribute('aria-checked', 'false');
  });

  // Clicking your own answer takes it back — otherwise the only way out of a
  // vote is a different vote, and "I'd rather not say" lands as a neutral one.
  it('withdraws the vote when the chosen stop is clicked again', async () => {
    let deleted = 0;
    server.use(
      http.delete('/api/entries/42/vote', () => {
        deleted += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRow({ entry: VOTED });
    const user = await expandRow();

    await user.click(screen.getByRole('radio', { name: 'Really keen' }));

    await waitFor(() => expect(deleted).toBe(1));
  });

  it('says so in the house words when the vote does not save', async () => {
    server.use(http.put('/api/entries/42/vote', () => HttpResponse.json({ error: 'no' }, { status: 500 })));
    renderRow({ entry: VOTED });
    const user = await expandRow();

    await user.click(screen.getByRole('radio', { name: 'Neutral' }));

    expect(await screen.findByText("That didn't save. It's still here — try again.")).toBeInTheDocument();
  });

  it('says who voted for what, in words a screen reader gets outright', async () => {
    renderRow({ entry: VOTED });
    await expandRow();

    expect(screen.getByRole('button', { name: 'Really keen: Demo Traveler' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not keen: Sarah' })).toBeInTheDocument();
  });
});

describe('IdeaRow — the to-dos inside', () => {
  it('lists the idea’s to-dos and offers a way to add one', async () => {
    server.use(
      http.get('/api/todos', () =>
        HttpResponse.json({ todos: [{ id: 7, entry_id: 42, title: 'Book the tea house', done_at: null }] }),
      ),
    );
    renderRow();
    await expandRow();

    expect(await screen.findByText('Book the tea house')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a to-do')).toBeInTheDocument();
  });
});

/**
 * "Add to plan" is the actions row's named button now, and the chips live in
 * its popover. The ⋯ menu keeps its own copy — the drag's pointer-free
 * equivalent — and both toggle the same links through the same mutations.
 */
describe('IdeaRow — plans from the open row', () => {
  async function openPlans(options: RowOptions) {
    renderRow(options);
    const user = await expandRow();
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));
    return user;
  }

  it('keeps the chips behind the button until they are asked for', async () => {
    renderRow({ bundles: [PLAN] });
    await expandRow();

    expect(screen.getByRole('button', { name: 'Add to plan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tuesday south' })).not.toBeInTheDocument();
  });

  it('adds the idea to a plan it is not in yet', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ link: {} });
    const onToast = vi.fn();
    const user = await openPlans({ bundles: [PLAN], members: new Map([[90, []]]), onToast });

    const chip = screen.getByRole('button', { name: 'Tuesday south' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);

    await waitFor(() => expect(post).toHaveBeenCalledWith('/entries/90/links', { child_id: 42 }));
    expect(onToast).toHaveBeenCalledWith('Added to Tuesday south.');
    post.mockRestore();
  });

  it('takes it out again, and says it is still kept', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ ok: true });
    const onToast = vi.fn();
    const user = await openPlans({ bundles: [PLAN], members: new Map([[90, [makeEntry({})]]]), onToast });

    const chip = screen.getByRole('button', { name: 'Tuesday south' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);

    await waitFor(() => expect(del).toHaveBeenCalledWith('/entries/90/links/42'));
    expect(onToast).toHaveBeenCalledWith('Removed from Tuesday south. Still kept.');
    del.mockRestore();
  });

  it('says plainly when there is no plan to add to yet', async () => {
    await openPlans({ bundles: [] });

    expect(screen.getByText('No plans yet. Start one in the plans column.')).toBeInTheDocument();
  });

  it('closes on Escape, handing focus back to the button', async () => {
    const user = await openPlans({ bundles: [PLAN] });

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Tuesday south' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to plan' })).toHaveFocus();
  });
});

describe('IdeaRow — the interactions that must survive', () => {
  // Dragging an idea onto a plan is the core board gesture; the plan drop
  // targets read `{ entryId, title }` off exactly this handle.
  it('keeps a labelled drag handle', () => {
    renderRow();
    expect(screen.getByRole('button', { name: 'Drag Fushimi Inari onto a plan to add it there' })).toBeInTheDocument();
  });

  // Every drag in Wend has a pointer-free equivalent. This is the row's, and
  // it lives inside the ⋯ menu with the rest of the row's verbs.
  it('keeps a pointer-free way into a plan', async () => {
    renderRow({ bundles: [PLAN] });
    await openActions();

    expect(screen.getByRole('button', { name: 'Tuesday south' })).toBeInTheDocument();
  });

  it('keeps the multi-select control BulkBar acts on, once the board is selecting', () => {
    renderRow({ selectMode: true, selected: true });
    expect(screen.getByRole('checkbox', { name: 'Select Fushimi Inari' })).toBeChecked();
  });

  // The row is the disclosure; the navigation it used to be is gone on
  // purpose, and "no navigation" must stay pinned down somewhere.
  it('opens the row rather than the entry screen when it is clicked', async () => {
    renderRow();
    await expandRow();

    expect(screen.queryByText('Entry detail screen')).not.toBeInTheDocument();
    expect(rowToggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('hands editing to the board when it offers to take it, rather than navigating away', async () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });
    const user = await openActions();

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(42);
    expect(screen.queryByText('Entry detail screen')).not.toBeInTheDocument();
  });

  it('sets an idea aside rather than destroying it', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ entry: makeEntry({ archived_at: 'now' }) });
    renderRow();
    const user = await openActions();

    await user.click(screen.getByRole('button', { name: 'Move to Set aside' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/entries/42'));
    expect(screen.queryByRole('button', { name: /delete permanently/i })).not.toBeInTheDocument();
    del.mockRestore();
  });
});

// The ⋯ menu sits at the open row's top right: every verb the row owns
// arrives with the panel, and the closed row stays a thing you read, drag or pick.
describe('IdeaRow — the ⋯ actions menu', () => {
  it('keeps every verb off the closed row', () => {
    renderRow();
    expect(screen.queryByRole('button', { name: 'Actions for Fushimi Inari' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to Set aside' })).not.toBeInTheDocument();
  });

  it('says whose actions they are, once the row is open', async () => {
    renderRow();
    await expandRow();
    const trigger = screen.getByRole('button', { name: 'Actions for Fushimi Inari' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  // Top right means the header, not the panel: the trigger lives outside the
  // element the disclosure controls, up with the title and the pills.
  it('keeps the ⋯ at the top right, outside the panel it acts on', async () => {
    renderRow();
    await expandRow();

    const trigger = screen.getByRole('button', { name: 'Actions for Fushimi Inari' });
    const panelId = rowToggle().getAttribute('aria-controls') as string;
    expect(trigger.closest(`#${CSS.escape(panelId)}`)).toBeNull();
  });

  // "Move to Set aside", not "Set aside": the menu is too tight for a line of
  // explanation, so the label names the list at the foot of the board that the
  // idea is going to — which is also the way back.
  it('offers Edit, both ways of moving the idea, and the plans together', async () => {
    renderRow({ bundles: [PLAN] });
    await openActions();

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make it a trip of its own' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Set aside' })).toBeInTheDocument();
    expect(screen.getAllByText('Add to plan').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Tuesday south' })).toBeInTheDocument();
  });

  /**
   * Lifting an idea out used to sit at the foot of the edit panel. It is a move
   * rather than a fact about the idea, so it joined the other moves here — and
   * the panel it left is now only about what the idea is.
   */
  it('lifts an idea out into a trip of its own, and closes behind itself', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ entry: makeEntry({ kind: 'trip' }) });
    renderRow();
    const user = await openActions();

    await user.click(screen.getByRole('button', { name: 'Make it a trip of its own' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/entries/42/lift'));
    expect(screen.queryByRole('button', { name: 'Make it a trip of its own' })).not.toBeInTheDocument();
    post.mockRestore();
  });

  /** A plan already is a container; there is nothing to lift it out of. */
  it('does not offer to make a trip out of a plan', async () => {
    renderRow({ entry: makeEntry({ kind: 'bundle' }) });
    await openActions();

    expect(screen.queryByRole('button', { name: 'Make it a trip of its own' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('edits from the menu, and closes it behind itself', async () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });
    const user = await openActions();

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(42);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to the button that opened it', async () => {
    renderRow();
    const user = await openActions();
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Fushimi Inari' })).toHaveFocus();
  });

  it('closes when you click away from it', async () => {
    renderRow();
    const user = await openActions();

    await user.click(document.body);

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});

// What the left slot holds: the drag handle, and nothing at all for someone
// who may not edit.
describe('IdeaRow — the left slot', () => {
  it('holds the drag handle while the board is not selecting', () => {
    renderRow();
    expect(screen.getByRole('button', { name: 'Drag Fushimi Inari onto a plan to add it there' })).toBeInTheDocument();
  });

  it('offers nothing to check while the board is not selecting', () => {
    renderRow();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

// The always-visible checkbox is gone. The left slot does both jobs: it holds
// the drag handle until the board starts picking, and holds the pick circle
// while it does — the swap is the only announcement the mode gets.
describe('IdeaRow — select mode', () => {
  it('puts a real checkbox in the slot the drag handle had', () => {
    renderRow({ selectMode: true });

    const pick = screen.getByRole('checkbox', { name: 'Select Fushimi Inari' });
    expect(pick).toHaveAttribute('aria-checked', 'false');
  });

  // A press-and-drag and a shift-click both start the same way. Leaving the
  // handle within reach of someone picking their way down a list is how an
  // idea lands on a plan by accident, so picking takes the slot outright.
  it('takes the drag handle away entirely while picking', () => {
    renderRow({ selectMode: true });

    expect(screen.queryByRole('button', { name: 'Drag Fushimi Inari onto a plan to add it there' })).not.toBeInTheDocument();
  });

  it('reports a picked idea as checked rather than leaving colour to say it', () => {
    renderRow({ selectMode: true, selected: true });

    const pick = screen.getByRole('checkbox', { name: 'Select Fushimi Inari' });
    expect(pick).toHaveAttribute('aria-checked', 'true');
    expect(pick).toHaveTextContent('✓');
  });

  it('gives the drag handle back the moment select mode ends', () => {
    renderRow({ selectMode: false });
    expect(screen.getByRole('button', { name: 'Drag Fushimi Inari onto a plan to add it there' })).toBeInTheDocument();
  });

  it('can be picked from the keyboard, since it is a button underneath', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    renderRow({ selectMode: true, onToggleSelect });

    screen.getByRole('checkbox', { name: 'Select Fushimi Inari' }).focus();
    await user.keyboard(' ');

    expect(onToggleSelect).toHaveBeenCalledWith(42, false);
  });

  it('still tells the board when a pick was shift-clicked, so ranges survive', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    renderRow({ selectMode: true, onToggleSelect });

    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select Fushimi Inari' }));
    await user.keyboard('{/Shift}');

    expect(onToggleSelect).toHaveBeenCalledWith(42, true);
  });

  it('reports a plain click as a plain pick', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    renderRow({ selectMode: true, onToggleSelect });

    await user.click(screen.getByRole('checkbox', { name: 'Select Fushimi Inari' }));

    expect(onToggleSelect).toHaveBeenCalledWith(42, false);
  });

  it('never opens the row when the pick circle is clicked', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    renderRow({ selectMode: true, onToggleExpand });

    await user.click(screen.getByRole('checkbox', { name: 'Select Fushimi Inari' }));

    expect(onToggleExpand).not.toHaveBeenCalled();
  });
});

/**
 * `canEdit={false}` is what the board hands a viewer. The row must lose every
 * verb and keep every word — the two are asserted together on purpose, because
 * "no buttons" is equally true of a row that never rendered.
 */
describe('IdeaRow — reading along', () => {
  it('takes the grip away entirely, rather than greying it', () => {
    renderRow({ canEdit: false, bundles: [PLAN] });

    expect(
      screen.queryByRole('button', { name: 'Drag Fushimi Inari onto a plan to add it there' }),
    ).not.toBeInTheDocument();
  });

  it('still says everything the closed row says — title, tick and pills', () => {
    renderRow({
      canEdit: false,
      entry: makeEntry({ scheduled: true }),
      insideCount: 2,
      otherParents: ['Kyoto day'],
    });

    expect(rowToggle()).toHaveTextContent('Fushimi Inari');
    expect(screen.getByText('✓ on a day')).toBeInTheDocument();
    expect(screen.getByText('▲ 4')).toBeInTheDocument();
    expect(screen.getByText('also in: Kyoto day')).toBeInTheDocument();
  });

  // Descending is reading, not editing — a viewer keeps the way down.
  it('still lets a viewer drill into what is inside', async () => {
    const user = userEvent.setup();
    const onDrill = vi.fn();
    renderRow({ canEdit: false, insideCount: 2, onDrill });

    await user.click(screen.getByRole('button', { name: '2 inside ›' }));

    expect(onDrill).toHaveBeenCalledWith(42);
  });

  // Nothing stands in for the grip a viewer does not get: the row simply starts
  // at the title, which is consistent down a viewer's whole board.
  it('leaves the left slot empty rather than filling it with a stand-in', () => {
    renderRow({ canEdit: false });

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  // The row opens in place, and a viewer keeps that — the canEdit guard wraps
  // the verbs, and must never grow to cover the disclosure or the panel.
  it('still opens the row — reading it is not editing it', async () => {
    renderRow({ canEdit: false });
    await expandRow();

    expect(rowToggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('gives a viewer the result of the vote, and no ballot to fill in', async () => {
    renderRow({ canEdit: false, entry: VOTED });
    await expandRow();

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Really keen: Demo Traveler' })).toBeInTheDocument();
    expect(screen.getByText('+1 · 2 votes')).toBeInTheDocument();
  });

  it('gives a viewer the to-dos to read, without the tick or the add row', async () => {
    server.use(
      http.get('/api/todos', () =>
        HttpResponse.json({ todos: [{ id: 7, entry_id: 42, title: 'Book the tea house', done_at: null }] }),
      ),
    );
    renderRow({ canEdit: false });
    await expandRow();

    expect(await screen.findByText('Book the tea house')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add a to-do')).not.toBeInTheDocument();
  });

  // No chips to press, but the answer to "which plans?" survives as tags.
  it('names the plans without offering to change them', async () => {
    renderRow({ canEdit: false, bundles: [PLAN], members: new Map([[90, [makeEntry({})]]]) });
    await expandRow();

    expect(screen.queryByRole('button', { name: 'Add to plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tuesday south' })).not.toBeInTheDocument();
    expect(screen.getByText('Tuesday south')).toBeInTheDocument();
  });

  it('still has no ⋯ menu and no actions row once the row is open', async () => {
    renderRow({ canEdit: false, bundles: [PLAN], insideCount: 3 });
    await expandRow();

    expect(screen.queryByRole('button', { name: 'Actions for Fushimi Inari' })).not.toBeInTheDocument();
    // The panel's descent button belongs to the actions row, so a viewer
    // reaches what's inside by the pill on the closed row instead.
    expect(screen.queryByRole('button', { name: 'Open 3 inside' })).not.toBeInTheDocument();
  });

  it('keeps both affordances for anyone who can edit', async () => {
    renderRow({ canEdit: true });

    expect(
      screen.getByRole('button', { name: 'Drag Fushimi Inari onto a plan to add it there' }),
    ).toBeInTheDocument();
    await expandRow();
    expect(screen.getByRole('button', { name: 'Actions for Fushimi Inari' })).toBeInTheDocument();
  });
});
