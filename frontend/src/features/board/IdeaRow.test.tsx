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
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 4, count: 2, average: 2 },
    my_vote: 2,
    scheduled: false,
    ...overrides,
  };
}

const BUNDLE = makeEntry({ id: 90, kind: 'bundle', title: 'Tuesday south', category: null, location_name: null });
const OTHER_BUNDLE = makeEntry({ id: 91, kind: 'bundle', title: 'Travel day', category: null, location_name: null });

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
}

function rowTree(options: RowOptions, queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/board']}>
        <ToastProvider>
          <DndContext>
            <Routes>
              <Route
                path="/board"
                element={
                  <IdeaRow
                    entry={options.entry ?? makeEntry({})}
                    bundles={options.bundles ?? []}
                    members={options.members ?? new Map()}
                    selectMode={options.selectMode ?? false}
                    selected={options.selected ?? false}
                    onToggleSelect={options.onToggleSelect ?? (() => {})}
                    onEdit={options.onEdit}
                    onToast={options.onToast}
                    canEdit={options.canEdit}
                  />
                }
              />
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

/** Opens the row's ⋯ menu and hands back the user-event session. */
async function openActions() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Actions for Fushimi Inari' }));
  return user;
}

/** The row's own disclosure button — title, score and chevron in one target. */
function rowToggle() {
  return screen.getByRole('button', { name: /^Fushimi Inari/ });
}

/** Expands the row and hands back the user-event session. */
async function expandRow() {
  const user = userEvent.setup();
  await user.click(rowToggle());
  return user;
}

describe('IdeaRow — what the board shows', () => {
  it('shows the title, its category and the meta line', () => {
    renderRow();
    const row = screen.getByRole('button', { name: /^Fushimi Inari/ });
    expect(row).toHaveTextContent('Fushimi Inari');
    expect(row).toHaveTextContent('Place');
    expect(row).toHaveTextContent('Kyoto south · 2 hr');
  });

  it('keeps the category out of the meta line, since it has its own slot', () => {
    renderRow();
    expect(screen.getByRole('button', { name: /^Fushimi Inari/ }).textContent).not.toMatch(/Place · /);
  });

  it('spells out open todos rather than leaving the dot to carry it alone', () => {
    renderRow({ entry: makeEntry({ todos_open_count: 2 }) });
    expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).toHaveTextContent('2 open');
  });

  it('names the bundles the idea is already in', () => {
    renderRow({ bundles: [BUNDLE], members: new Map([[90, [makeEntry({})]]]) });
    expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).toHaveTextContent('in Tuesday south');
  });

  it('lists several bundles on one line, comma-separated, in one lowercase sentence', () => {
    renderRow({
      bundles: [BUNDLE, OTHER_BUNDLE],
      members: new Map([
        [90, [makeEntry({})]],
        [91, [makeEntry({})]],
      ]),
    });
    expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).toHaveTextContent(
      'in Tuesday south, Travel day',
    );
  });

  it('says nothing about bundles when the idea is in none', () => {
    renderRow({ bundles: [BUNDLE], members: new Map([[90, []]]) });
    expect(screen.getByRole('button', { name: /^Fushimi Inari/ }).textContent).not.toMatch(/^in /m);
  });

  it('names a bundle the moment the idea is added to it', () => {
    const view = renderRow({ bundles: [BUNDLE], members: new Map([[90, []]]) });
    expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).not.toHaveTextContent('in Tuesday south');

    view.update({ bundles: [BUNDLE], members: new Map([[90, [makeEntry({})]]]) });

    expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).toHaveTextContent('in Tuesday south');
  });
});

/**
 * Clicking a row used to throw the edit drawer over the board. It now opens the
 * row itself, which is the smaller and reversible thing to do to someone who
 * clicked a line of text — and editing keeps its named button in the ⋯ menu.
 */
describe('IdeaRow — opening the row', () => {
  it('opens on a click and closes on the next one', async () => {
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

  it('still edits from the ⋯ menu, which is the only way in now', async () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });
    const user = await openActions();

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(onEdit).toHaveBeenCalledWith(42);
  });

  it('shows the idea’s own words once it is open, description and notes both', async () => {
    renderRow({
      entry: makeEntry({ description: 'Thousand torii gates up the hill.', notes: 'Go before eight.' }),
    });
    await expandRow();

    expect(screen.getByText('Thousand torii gates up the hill.')).toBeInTheDocument();
    expect(screen.getByText('Go before eight.')).toBeInTheDocument();
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

/**
 * The tally is a fact about the group's appetite, not one of the idea's own
 * fields — so it reads on the closed row and is voted on inside the open one.
 */
describe('IdeaRow — the group score', () => {
  it('signs a positive total, so it reads as a score rather than a headcount', () => {
    renderRow({ entry: makeEntry({ vote_tally: { total: 5, count: 3, average: 1.67 } }) });

    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('group score')).toBeInTheDocument();
  });

  it('leaves a negative total its own sign and zero none', () => {
    const view = renderRow({ entry: makeEntry({ vote_tally: { total: -2, count: 2, average: -1 } }) });
    expect(screen.getByText('-2')).toBeInTheDocument();

    view.update({ entry: makeEntry({ vote_tally: { total: 0, count: 2, average: 0 } }) });
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('stays on the row whether it is open or shut', async () => {
    renderRow();
    const user = await expandRow();
    expect(screen.getByText('+4')).toBeInTheDocument();

    await user.click(rowToggle());

    expect(screen.getByText('+4')).toBeInTheDocument();
  });

  it('spells the scale out for anyone who wonders what the number is', () => {
    renderRow();
    expect(screen.getByTitle("Everyone's votes added up, from +2 to -2 each")).toBeInTheDocument();
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
 * The signed-in user votes from the open row, sees who else has, and the score
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

/** The count on the closed row ("2 open") is what this panel opens up. */
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
 * The panel's bundle chips and the ⋯ menu's are the same act reached from two
 * places — the requirements asked for both, and both toggle the same link.
 */
describe('IdeaRow — bundles from the open row', () => {
  it('adds the idea to a bundle it is not in yet', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ link: {} });
    const onToast = vi.fn();
    renderRow({ bundles: [BUNDLE], members: new Map([[90, []]]), onToast });
    const user = await expandRow();

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
    renderRow({ bundles: [BUNDLE], members: new Map([[90, [makeEntry({})]]]), onToast });
    const user = await expandRow();

    const chip = screen.getByRole('button', { name: 'Tuesday south' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await user.click(chip);

    await waitFor(() => expect(del).toHaveBeenCalledWith('/entries/90/links/42'));
    expect(onToast).toHaveBeenCalledWith('Removed from Tuesday south. Still kept.');
    del.mockRestore();
  });

  it('says plainly when there is no bundle to add to yet', async () => {
    renderRow({ bundles: [] });
    await expandRow();

    expect(screen.getByText('No bundles yet. Start one in the bundles column.')).toBeInTheDocument();
  });
});

describe('IdeaRow — the interactions that must survive', () => {
  // Dragging an idea onto a bundle is the core board gesture; the bundle drop
  // targets read `{ entryId, title }` off exactly this handle.
  it('keeps a labelled drag handle', () => {
    renderRow();
    expect(screen.getByRole('button', { name: 'Drag Fushimi Inari onto a bundle to add it there' })).toBeInTheDocument();
  });

  // Every drag in Wend has a pointer-free equivalent. This is the row's, and it
  // moved inside the ⋯ menu with the rest of the row's verbs.
  it('keeps a pointer-free way into a bundle', async () => {
    renderRow({ bundles: [BUNDLE] });
    await openActions();

    expect(screen.getByRole('button', { name: 'Tuesday south' })).toBeInTheDocument();
  });

  it('keeps the multi-select control BulkBar acts on, once the board is selecting', () => {
    renderRow({ selectMode: true, selected: true });
    expect(screen.getByRole('checkbox', { name: 'Select Fushimi Inari' })).toBeChecked();
  });

  // Was: "opens the entry when the row is clicked". The row is the disclosure
  // now, so the shortcut it used to be is gone on purpose — the assertion is
  // rewritten to the new intent rather than dropped, because "no navigation"
  // must stay pinned down somewhere.
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

// The feedback: editing arrived unasked-for, as a drawer over a page that had
// gone blank. It now has a named button, and the row's actions are in one place
// rather than strewn along its right-hand edge.
describe('IdeaRow — the ⋯ actions menu', () => {
  it('says whose actions they are', () => {
    renderRow();
    const trigger = screen.getByRole('button', { name: 'Actions for Fushimi Inari' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the actions out of the way until they are asked for', () => {
    renderRow();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to Set aside' })).not.toBeInTheDocument();
  });

  // "Move to Set aside", not "Set aside": the menu is too tight for a line of
  // explanation, so the label names the list at the foot of the board that the
  // idea is going to — which is also the way back.
  it('offers Edit, both ways of moving the idea, and the bundles together', async () => {
    renderRow({ bundles: [BUNDLE] });
    await openActions();

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make it a trip of its own' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Set aside' })).toBeInTheDocument();
    expect(screen.getByText('Add to bundle')).toBeInTheDocument();
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

  /** A bundle already is a container; there is nothing to lift it out of. */
  it('does not offer to make a trip out of a bundle', async () => {
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

  it('shows which bundles the idea is already in, and takes it out again', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ link: {} });
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ ok: true });
    const onToast = vi.fn();
    renderRow({ bundles: [BUNDLE], members: new Map([[90, [makeEntry({})]]]), onToast });
    const user = await openActions();

    const chip = screen.getByRole('button', { name: 'Tuesday south' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    await user.click(chip);

    await waitFor(() => expect(del).toHaveBeenCalled());
    expect(post).not.toHaveBeenCalled();
    post.mockRestore();
    del.mockRestore();
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

  it('says so plainly when there is no bundle to add to yet', async () => {
    renderRow({ bundles: [] });
    await openActions();

    expect(screen.getByText(/No bundles yet/)).toBeInTheDocument();
  });
});

// The dot is derived, not stored — see the mapping comment in IdeaRow.tsx.
// It is never colour alone: the same wording reaches assistive tech.
describe('IdeaRow — the state dot', () => {
  it('reads as scheduled once the idea has a slot', () => {
    renderRow({ entry: makeEntry({ scheduled: true }) });
    expect(screen.getByRole('img', { name: 'Scheduled' })).toBeInTheDocument();
  });

  it('reads as still-to-sort-out while unscheduled with open todos', () => {
    renderRow({ entry: makeEntry({ scheduled: false, todos_open_count: 1 }) });
    expect(screen.getByRole('img', { name: 'Still something to sort out' })).toBeInTheDocument();
  });

  it('reads as kept-but-unplaced when nothing is blocking it', () => {
    renderRow({ entry: makeEntry({ scheduled: false, todos_open_count: 0 }) });
    expect(screen.getByRole('img', { name: 'Kept, not placed yet' })).toBeInTheDocument();
  });

  it('prefers scheduled over open todos — a placed idea is placed', () => {
    renderRow({ entry: makeEntry({ scheduled: true, todos_open_count: 3 }) });
    expect(screen.getByRole('img', { name: 'Scheduled' })).toBeInTheDocument();
  });

  it('offers nothing to check while the board is not selecting', () => {
    renderRow();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

// The always-visible checkbox is gone. The dot does both jobs: it describes the
// idea's state until the board starts picking, and becomes the pick circle when
// it does — the growth from 10px to 22px is the only announcement the mode gets.
describe('IdeaRow — select mode', () => {
  it('turns the state dot into a real checkbox, keeping the name it always had', () => {
    renderRow({ selectMode: true });

    const pick = screen.getByRole('checkbox', { name: 'Select Fushimi Inari' });
    expect(pick).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByRole('img', { name: 'Kept, not placed yet' })).not.toBeInTheDocument();
  });

  it('reports a picked idea as checked rather than leaving colour to say it', () => {
    renderRow({ selectMode: true, selected: true });

    const pick = screen.getByRole('checkbox', { name: 'Select Fushimi Inari' });
    expect(pick).toHaveAttribute('aria-checked', 'true');
    expect(pick).toHaveTextContent('✓');
  });

  it('gives the state dot back the moment select mode ends', () => {
    renderRow({ selectMode: false, entry: makeEntry({ scheduled: true }) });
    expect(screen.getByRole('img', { name: 'Scheduled' })).toBeInTheDocument();
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

  it('never opens the idea when the pick circle is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderRow({ selectMode: true, onEdit });

    await user.click(screen.getByRole('checkbox', { name: 'Select Fushimi Inari' }));

    expect(onEdit).not.toHaveBeenCalled();
  });
});

/**
 * `canEdit={false}` is what the board hands a viewer. The row must lose every
 * verb and keep every word — the two are asserted together on purpose, because
 * "no buttons" is equally true of a row that never rendered.
 */
describe('IdeaRow — reading along', () => {
  it('takes the grip and the ⋯ menu away entirely, rather than greying them', () => {
    renderRow({ canEdit: false, bundles: [BUNDLE] });

    expect(
      screen.queryByRole('button', { name: 'Drag Fushimi Inari onto a bundle to add it there' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Fushimi Inari' })).not.toBeInTheDocument();
  });

  it('still says everything it said before — title, category, meta, state and its bundles', () => {
    renderRow({
      canEdit: false,
      bundles: [BUNDLE],
      members: new Map([[90, [makeEntry({})]]]),
    });

    const row = screen.getByRole('button', { name: /^Fushimi Inari/ });
    expect(row).toHaveTextContent('Fushimi Inari');
    expect(row).toHaveTextContent('Place');
    expect(row).toHaveTextContent('Kyoto south · 2 hr');
    expect(row).toHaveTextContent('in Tuesday south');
    expect(screen.getByRole('img', { name: 'Kept, not placed yet' })).toBeInTheDocument();
  });

  // Was: "still opens the idea". The row opens in place now, and a viewer keeps
  // that — the canEdit guard wraps the ⋯ menu and the grip, and must never
  // grow to cover the disclosure or the panel.
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
    expect(screen.getByText('+1 \u00b7 2 votes')).toBeInTheDocument();
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

  // No chips to press, but the answer to "which bundles?" survives as tags.
  it('names the bundles without offering to change them', async () => {
    renderRow({ canEdit: false, bundles: [BUNDLE], members: new Map([[90, [makeEntry({})]]]) });
    await expandRow();

    expect(screen.queryByRole('button', { name: 'Tuesday south' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Tuesday south').length).toBeGreaterThan(0);
  });

  it('still has no ⋯ menu and no grip once the row is open', async () => {
    renderRow({ canEdit: false, bundles: [BUNDLE] });
    await expandRow();

    expect(screen.queryByRole('button', { name: 'Actions for Fushimi Inari' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Drag Fushimi Inari onto a bundle to add it there' }),
    ).not.toBeInTheDocument();
  });

  it('keeps both affordances for anyone who can edit', () => {
    renderRow({ canEdit: true });

    expect(
      screen.getByRole('button', { name: 'Drag Fushimi Inari onto a bundle to add it there' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Fushimi Inari' })).toBeInTheDocument();
  });
});
