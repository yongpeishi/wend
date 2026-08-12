import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { IdeaRow } from './IdeaRow';
import { api } from '../../api';
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

function renderRow(
  options: {
    entry?: Entry;
    bundles?: Entry[];
    members?: Map<number, Entry[]>;
    selected?: boolean;
    onEdit?: (id: number) => void;
    onToast?: (message: string) => void;
  } = {},
) {
  const entry = options.entry ?? makeEntry({});
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/board']}>
        <ToastProvider>
          <DndContext>
            <Routes>
              <Route
                path="/board"
                element={
                  <IdeaRow
                    entry={entry}
                    bundles={options.bundles ?? []}
                    members={options.members ?? new Map()}
                    selected={options.selected ?? false}
                    onToggleSelect={() => {}}
                    onEdit={options.onEdit}
                    onToast={options.onToast}
                  />
                }
              />
              <Route path="/entries/:id" element={<p>Entry detail screen</p>} />
            </Routes>
          </DndContext>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Opens the row's ⋯ menu and hands back the user-event session. */
async function openActions() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Actions for Fushimi Inari' }));
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
});

// Rating is descoped from the board for now. VoteControl and the votes on the
// entry detail screen are untouched, so this stays one import away from
// coming back — but nothing on the row may show or take a score.
describe('IdeaRow — rating is descoped here', () => {
  it('offers no vote control, even for an idea that already has votes', () => {
    renderRow({ entry: makeEntry({ my_vote: 2, vote_tally: { total: 4, count: 2, average: 2 } }) });
    expect(screen.queryByRole('group', { name: /rating/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /want|rating|vote/i })).not.toBeInTheDocument();
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

  it('keeps the multi-select checkbox BulkBar acts on', () => {
    renderRow({ selected: true });
    expect(screen.getByRole('checkbox', { name: 'Select Fushimi Inari' })).toBeChecked();
  });

  it('opens the entry when the row is clicked', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole('button', { name: /^Fushimi Inari/ }));

    expect(await screen.findByText('Entry detail screen')).toBeInTheDocument();
  });

  it('hands editing to the board when it offers to take it, rather than navigating away', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderRow({ onEdit });

    await user.click(screen.getByRole('button', { name: /^Fushimi Inari/ }));

    expect(onEdit).toHaveBeenCalledWith(42);
    expect(screen.queryByText('Entry detail screen')).not.toBeInTheDocument();
  });

  it('sets an idea aside rather than destroying it', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ entry: makeEntry({ archived_at: 'now' }) });
    renderRow();
    const user = await openActions();

    await user.click(screen.getByRole('button', { name: 'Set aside' }));

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
    expect(screen.queryByRole('button', { name: 'Set aside' })).not.toBeInTheDocument();
  });

  it('offers Edit, Set aside and the bundles together', async () => {
    renderRow({ bundles: [BUNDLE] });
    await openActions();

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set aside' })).toBeInTheDocument();
    expect(screen.getByText('Add to bundle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tuesday south' })).toBeInTheDocument();
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
});
