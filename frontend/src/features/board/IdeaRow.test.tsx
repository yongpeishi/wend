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
  onToast?: (message: string) => void;
  canEdit?: boolean;
  insideCount?: number;
  otherParents?: string[];
  /** Every live idea on the trip — what the inline edit form reads. */
  allIdeas?: Entry[];
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
      onToast={options.onToast}
      canEdit={options.canEdit}
      insideCount={options.insideCount ?? 0}
      otherParents={options.otherParents ?? []}
      allIdeas={options.allIdeas ?? [entry]}
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

/** The plum category-and-tally pill, found by the scale it spells out. */
function tallyPill() {
  return screen.getByTitle("Everyone's votes added up, from +2 to -2 each");
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

/** Opens the row and swaps it for the inline edit form. */
async function startEditing() {
  const user = await expandRow();
  await user.click(screen.getByRole('button', { name: 'Edit' }));
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

  it('carries category and tally together in one pill when anyone is keen', () => {
    renderRow({
      entry: makeEntry({ category: 'food', vote_tally: { total: 5, count: 3, average: 1.67 } }),
    });
    // The thumb between them is aria-hidden SVG, so the pill's words are the
    // label and the number, side by side.
    expect(tallyPill()).toHaveTextContent('Food·5');
  });

  it('lets a negative total carry its own minus sign', () => {
    renderRow({
      entry: makeEntry({ category: 'transport', vote_tally: { total: -2, count: 2, average: -1 } }),
    });
    expect(tallyPill()).toHaveTextContent('Transport·-2');
  });

  it('spells the scale out for anyone who wonders what the number is', () => {
    renderRow();
    expect(screen.getByTitle("Everyone's votes added up, from +2 to -2 each")).toBeInTheDocument();
  });

  it('draws no scoreboard on an idea nobody has judged — the category stands alone', () => {
    renderRow({ entry: makeEntry({ vote_tally: { total: 0, count: 0, average: 0 } }) });
    expect(tallyPill()).toHaveTextContent(/^Place$/);
  });

  it('draws no pill at all with no category and no votes', () => {
    renderRow({
      entry: makeEntry({ category: null, vote_tally: { total: 0, count: 0, average: 0 } }),
    });
    expect(
      screen.queryByTitle("Everyone's votes added up, from +2 to -2 each"),
    ).not.toBeInTheDocument();
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

  // The pill at the top right is the card's ONE drill affordance — the panel
  // used to carry a second "Open N inside" button, and it is gone on purpose.
  it('keeps the pill as the only way down once the row is open', async () => {
    const onDrill = vi.fn();
    renderRow({ insideCount: 3, onDrill });
    const user = await expandRow();

    expect(screen.queryByRole('button', { name: /^Open .* inside$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '3 inside ›' }));

    expect(onDrill).toHaveBeenCalledWith(42);
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

  it('does not open the edit form when the row is clicked — that is the Edit button’s job', async () => {
    renderRow();
    const user = userEvent.setup();

    await user.click(rowToggle());

    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
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

  // The category lives in the header pill in both states — opening the row
  // must not sprout a second copy beside the title.
  it('keeps the category in the header pill once it is open, and says it once', async () => {
    renderRow();
    await expandRow();

    expect(tallyPill()).toHaveTextContent('Place');
    expect(rowToggle()).not.toHaveTextContent('Place');
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

  // Every drag in Wend has a pointer-free equivalent. This is the row's: the
  // plan chips behind the open panel's "Add to plan" button.
  it('keeps a pointer-free way into a plan', async () => {
    renderRow({ bundles: [PLAN] });
    const user = await expandRow();
    await user.click(screen.getByRole('button', { name: 'Add to plan' }));

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

  it('edits in place, never navigating away', async () => {
    renderRow();
    await startEditing();

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(screen.queryByText('Entry detail screen')).not.toBeInTheDocument();
  });

  it('sets an idea aside rather than destroying it', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ entry: makeEntry({ archived_at: 'now' }) });
    renderRow();
    const user = await expandRow();

    await user.click(screen.getByRole('button', { name: 'Move to Set aside' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/entries/42'));
    expect(screen.queryByRole('button', { name: /delete permanently/i })).not.toBeInTheDocument();
    del.mockRestore();
  });
});

// The open card's verbs sit on one line at the foot of the panel — the ⋯
// overflow menu is gone, and the closed row stays a thing you read, drag or pick.
describe('IdeaRow — the actions row', () => {
  it('keeps every verb off the closed row', () => {
    renderRow();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to Set aside' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to plan' })).not.toBeInTheDocument();
  });

  // "Move to Set aside", not "Set aside": the label names the list at the foot
  // of the board that the idea is going to — which is also the way back.
  it('offers Add to plan, Edit and Move to Set aside together, once the row is open', async () => {
    renderRow({ bundles: [PLAN] });
    await expandRow();

    expect(screen.getByRole('button', { name: 'Add to plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Set aside' })).toBeInTheDocument();
  });

  // The overflow menu and everything only it offered are gone from the board —
  // the bulk bar keeps the multi-select version of the lift.
  it('has no ⋯ menu and no "Make it a trip of its own" anywhere on the card', async () => {
    renderRow({ bundles: [PLAN] });
    await expandRow();

    expect(screen.queryByRole('button', { name: 'Actions for Fushimi Inari' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make it a trip of its own' })).not.toBeInTheDocument();
  });

  it('toasts "Set aside." once the idea is set aside', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ entry: makeEntry({ archived_at: 'now' }) });
    renderRow();
    const user = await expandRow();

    await user.click(screen.getByRole('button', { name: 'Move to Set aside' }));

    expect(await screen.findByText('Set aside.')).toBeInTheDocument();
    del.mockRestore();
  });

  it('says the house sentence when setting aside does not save', async () => {
    server.use(http.delete('/api/entries/42', () => HttpResponse.json({ error: 'no' }, { status: 500 })));
    renderRow();
    const user = await expandRow();

    await user.click(screen.getByRole('button', { name: 'Move to Set aside' }));

    expect(await screen.findByText("That didn't save. It's still here — try again.")).toBeInTheDocument();
  });
});

/**
 * Edit swaps the card in place for the same details form the capture bar's
 * Tab opens (IdeaComposer), seeded with the idea's facts. The row owns what
 * "Save" means: the entry PATCH, then the parent-link diff.
 */
describe('IdeaRow — editing in place', () => {
  /** 42's world: a current parent, a possible parent, and a child of its own. */
  const KYOTO_DAY = makeEntry({ id: 7, title: 'Kyoto day' });
  const FOOD_CRAWL = makeEntry({ id: 8, title: 'Food crawl' });
  const SHRINE_PATH = makeEntry({ id: 9, title: 'Shrine path', parent_ids: [42] });
  // Parent 90 is a bundle — not in the idea set, so the form must not name it.
  const ENTRY = makeEntry({
    description: 'Thousand torii gates.',
    address: '68 Fukakusa',
    category: 'activity',
    parent_ids: [7, 90],
  });
  const ALL_IDEAS = [ENTRY, KYOTO_DAY, FOOD_CRAWL, SHRINE_PATH];

  it('swaps the card for the details form, seeded with the idea as it stands', async () => {
    renderRow({ entry: ENTRY, allIdeas: ALL_IDEAS });
    await startEditing();

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Fushimi Inari');
    expect(screen.getByRole('textbox', { name: 'Short description' })).toHaveValue('Thousand torii gates.');
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue('68 Fukakusa');
    expect(screen.getByRole('radio', { name: 'Activity' })).toHaveAttribute('aria-checked', 'true');
    // The idea parent is named; the bundle (90) is not the form's to claim.
    expect(screen.getByRole('button', { name: 'Remove from Kyoto day' })).toBeInTheDocument();
    expect(screen.queryByText('#90')).not.toBeInTheDocument();
    // The card's header and panel are gone — the form IS the card now.
    expect(screen.queryByRole('button', { name: /^Fushimi Inari/ })).not.toBeInTheDocument();
    expect(screen.queryByText('To-do')).not.toBeInTheDocument();
  });

  it('never offers the idea itself or its own subtree as a parent', async () => {
    renderRow({ entry: ENTRY, allIdeas: ALL_IDEAS });
    const user = await startEditing();

    await user.click(screen.getByRole('button', { name: '+ add parent' }));

    // Food crawl is a real choice; the idea and its child would make a loop.
    expect(screen.getByRole('button', { name: 'Food crawl' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shrine path' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fushimi Inari' })).not.toBeInTheDocument();
  });

  it('saves the edited facts through PATCH and comes back to the open panel', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ entry: ENTRY });
    const onToast = vi.fn();
    renderRow({ entry: ENTRY, allIdeas: ALL_IDEAS, onToast });
    const user = await startEditing();

    await user.clear(screen.getByRole('textbox', { name: 'Short description' }));
    await user.type(screen.getByRole('textbox', { name: 'Short description' }), 'Ten thousand gates.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/entries/42', {
        entry: {
          title: 'Fushimi Inari',
          description: 'Ten thousand gates.',
          address: '68 Fukakusa',
          category: 'activity',
        },
      }),
    );
    expect(onToast).toHaveBeenCalledWith('Saved.');
    // Back to the card, form gone.
    expect(await screen.findByRole('button', { name: /^Fushimi Inari/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    patch.mockRestore();
  });

  it('writes an emptied description and address as null, not empty words', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ entry: ENTRY });
    renderRow({ entry: ENTRY, allIdeas: ALL_IDEAS });
    const user = await startEditing();

    await user.clear(screen.getByRole('textbox', { name: 'Short description' }));
    await user.clear(screen.getByRole('textbox', { name: 'Address' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/entries/42', {
        entry: { title: 'Fushimi Inari', description: null, address: null, category: 'activity' },
      }),
    );
    patch.mockRestore();
  });

  it('turns the parent diff into links added and removed, never rewrites', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ entry: ENTRY });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ link: {} });
    const del = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    renderRow({ entry: ENTRY, allIdeas: ALL_IDEAS });
    const user = await startEditing();

    // Out of Kyoto day, into Food crawl.
    await user.click(screen.getByRole('button', { name: 'Remove from Kyoto day' }));
    await user.click(screen.getByRole('button', { name: '+ add parent' }));
    await user.click(screen.getByRole('button', { name: 'Food crawl' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/entries/8/links', { child_id: 42 }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/entries/7/links/42'));
    patch.mockRestore();
    post.mockRestore();
    del.mockRestore();
  });

  it('stays in the form when the save fails, with the typing intact', async () => {
    server.use(http.patch('/api/entries/42', () => HttpResponse.json({ error: 'no' }, { status: 500 })));
    renderRow({ entry: ENTRY, allIdeas: ALL_IDEAS });
    const user = await startEditing();

    await user.type(screen.getByRole('textbox', { name: 'Name' }), ' Taisha');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText("That didn't save. It's still here — try again.")).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Fushimi Inari Taisha');
  });

  it('cancels back to the open panel, saving nothing', async () => {
    const patch = vi.spyOn(api, 'patch');
    renderRow({ entry: ENTRY, allIdeas: ALL_IDEAS });
    const user = await startEditing();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
    patch.mockRestore();
  });

  // `editing` dies with the expansion: a row the board closed mid-edit must
  // come back as a card, not as the form someone else's drill left behind.
  it('forgets it was editing once the board closes the row', async () => {
    const view = renderRow({ entry: ENTRY, allIdeas: ALL_IDEAS, expanded: true });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();

    view.update({ entry: ENTRY, allIdeas: ALL_IDEAS, expanded: false });
    view.update({ entry: ENTRY, allIdeas: ALL_IDEAS, expanded: true });

    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.getByText('To-do')).toBeInTheDocument();
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
    expect(tallyPill()).toHaveTextContent('Place·4');
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

  it('still has no actions row once the row is open', async () => {
    renderRow({ canEdit: false, bundles: [PLAN], insideCount: 3 });
    await expandRow();

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to Set aside' })).not.toBeInTheDocument();
    // Descending is reading, so the pill stays — the viewer's way down is the
    // same one an editor has.
    expect(screen.getByRole('button', { name: '3 inside ›' })).toBeInTheDocument();
  });

  it('keeps both affordances for anyone who can edit', async () => {
    renderRow({ canEdit: true });

    expect(
      screen.getByRole('button', { name: 'Drag Fushimi Inari onto a plan to add it there' }),
    ).toBeInTheDocument();
    await expandRow();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
