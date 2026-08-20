import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { TripRoleProvider } from '../../auth/TripRoleContext';
import { BundleCard } from './BundleCard';
import { api } from '../../api';
import type { Entry } from '../../api/types';

function entry(
  id: number,
  title: string,
  kind: Entry['kind'] = 'idea',
  scheduled = false,
  todosOpen = 0,
  address: string | null = null,
): Entry {
  return {
    id,
    kind,
    title,
    description: null,
    category: 'food',
    starts_on: null,
    ends_on: null,
    location_name: null,
    address,
    lat: null,
    lng: null,
    duration_minutes: null,
    source_url: null,
    notes: null,
    from_entry_id: null,
    to_entry_id: null,
    pros: [],
    cons: [],
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    parent_ids: [],
    children_count: 0,
    todos_open_count: todosOpen,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled,
  };
}

const BUNDLE = entry(90, 'Kyoto dinner options', 'bundle');
const MEMBERS = [entry(91, 'Ramen alley'), entry(92, 'Kaiseki counter'), entry(93, 'Standing sushi')];

function renderCard(
  members = MEMBERS,
  bundle = BUNDLE,
  onToast: (message: string) => void = () => {},
  onOpen?: (id: number) => void,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/board']}>
        <ToastProvider>
          <DndContext>
            <Routes>
              <Route
                path="/board"
                element={<BundleCard bundle={bundle} members={members} onOpen={onOpen} onToast={onToast} />}
              />
              {/* So a card that leaves the board can be seen leaving it. */}
              <Route path="/entries/:id" element={<p>Entry detail screen</p>} />
            </Routes>
          </DndContext>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BundleCard — naming a bundle in place', () => {
  it('renames on Enter without ever opening a dialog', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ entry: { ...BUNDLE, title: 'Dinner, decided' } });
    renderCard();

    await user.click(screen.getByRole('button', { name: `Rename ${BUNDLE.title}` }));
    const field = screen.getByRole('textbox', { name: 'Plan name' });
    await user.clear(field);
    await user.type(field, 'Dinner, decided{Enter}');

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [path, body] = patch.mock.calls[0] as [string, { entry: { title: string } }];
    expect(path).toContain(`/entries/${BUNDLE.id}`);
    expect(body.entry.title).toBe('Dinner, decided');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    patch.mockRestore();
  });

  // Clicking away is a commit, not a cancel: the edit is already visible, so
  // losing it because focus moved would be the surprising outcome.
  it('commits when focus leaves the field', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ entry: { ...BUNDLE, title: 'Dinner, decided' } });
    renderCard();

    await user.click(screen.getByRole('button', { name: `Rename ${BUNDLE.title}` }));
    await user.clear(screen.getByRole('textbox', { name: 'Plan name' }));
    await user.type(screen.getByRole('textbox', { name: 'Plan name' }), 'Dinner, decided');
    await user.tab();

    await waitFor(() => expect(patch).toHaveBeenCalled());
    patch.mockRestore();
  });

  it('reverts on Escape and hands focus back to the name', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ entry: BUNDLE });
    renderCard();

    const nameButton = screen.getByRole('button', { name: `Rename ${BUNDLE.title}` });
    await user.click(nameButton);
    await user.clear(screen.getByRole('textbox', { name: 'Plan name' }));
    await user.type(screen.getByRole('textbox', { name: 'Plan name' }), 'Something else{Escape}');

    expect(patch).not.toHaveBeenCalled();
    const restored = await screen.findByRole('button', { name: `Rename ${BUNDLE.title}` });
    // A keyboard user must not be dropped at the top of the document.
    await waitFor(() => expect(restored).toHaveFocus());
    patch.mockRestore();
  });

  // A nameless bundle is unfindable in a rail of them, so the blank is refused
  // and the old name simply stands.
  it('refuses a blank name rather than saving one', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ entry: BUNDLE });
    renderCard();

    await user.click(screen.getByRole('button', { name: `Rename ${BUNDLE.title}` }));
    await user.clear(screen.getByRole('textbox', { name: 'Plan name' }));
    await user.type(screen.getByRole('textbox', { name: 'Plan name' }), '   {Enter}');

    expect(patch).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: `Rename ${BUNDLE.title}` })).toBeInTheDocument();
    patch.mockRestore();
  });
});

describe('BundleCard — removing a bundle without destroying anything', () => {
  it('unlinks every member first, then archives the bundle', async () => {
    const user = userEvent.setup();
    // Archiving is a DELETE that returns the soft-archived entry; unlinking
    // returns nothing and ignores the body.
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ entry: { ...BUNDLE, archived_at: 'now' } });
    const onToast = vi.fn();
    renderCard(MEMBERS, BUNDLE, onToast);

    await user.click(screen.getByRole('button', { name: `Remove plan ${BUNDLE.title}` }));

    await waitFor(() => expect(del).toHaveBeenCalledTimes(4));
    const paths = del.mock.calls.map((c) => c[0] as string);
    for (const member of MEMBERS) {
      expect(paths).toContain(`/entries/${BUNDLE.id}/links/${member.id}`);
      // The ideas themselves survive — they go back to the idea list.
      expect(paths).not.toContain(`/entries/${member.id}`);
    }
    // The archive is last: a failure part-way leaves a bundle that still has
    // its ideas, never an archived shell with orphaned links.
    expect(paths[3]).toBe(`/entries/${BUNDLE.id}`);
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(`Removed ${BUNDLE.title}. 3 ideas back in your list.`),
    );
    del.mockRestore();
  });

  it('archives an empty bundle with nothing to unlink', async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ entry: { ...BUNDLE, archived_at: 'now' } });
    renderCard([]);

    await user.click(screen.getByRole('button', { name: `Remove plan ${BUNDLE.title}` }));

    await waitFor(() => expect(del).toHaveBeenCalledWith(`/entries/${BUNDLE.id}`));
    expect(del).toHaveBeenCalledTimes(1);
    del.mockRestore();
  });
});

describe('BundleCard — reordering and unlinking members', () => {
  // Drag is an accelerator, never the only path — the brief requires a
  // pointer-free way to reorder, so this exercises the buttons, not a drag.
  it('reorders members with the keyboard path, swapping the two link positions', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ link: {} });
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Move Kaiseki counter up' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    const calls = patch.mock.calls as [string, { position: number }][];
    // Kaiseki (92) takes slot 0 and Ramen (91) takes slot 1 — a straight swap,
    // leaving Standing sushi untouched at the end.
    expect(calls).toContainEqual([
      `/entries/${BUNDLE.id}/links/92`,
      expect.objectContaining({ position: 0 }),
    ]);
    expect(calls).toContainEqual([
      `/entries/${BUNDLE.id}/links/91`,
      expect.objectContaining({ position: 1 }),
    ]);
    expect(calls.some(([path]) => path.endsWith('/links/93'))).toBe(false);
    patch.mockRestore();
  });

  it('does not offer to move the first member up or the last one down', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Move Ramen alley up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Standing sushi down' })).toBeDisabled();
  });

  // Removing a member unlinks it. The idea itself is never archived or
  // destroyed — nothing in Wend is discarded.
  it('removes a member by unlinking only, never deleting the idea', async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    renderCard();

    await user.click(
      screen.getByRole('button', { name: `Remove Ramen alley from ${BUNDLE.title}` }),
    );

    await waitFor(() => expect(del).toHaveBeenCalled());
    const paths = del.mock.calls.map((c) => c[0] as string);
    // The link goes...
    expect(paths.some((p) => p === `/entries/${BUNDLE.id}/links/91`)).toBe(true);
    // ...and the entry itself is never touched.
    expect(paths.some((p) => p === '/entries/91')).toBe(false);
    del.mockRestore();
  });
});

/**
 * A member opens over the board when the board offers to take it. Leaving for
 * /entries/:id put the drawer on a page of its own — nothing under its scrim to
 * show through, and nothing above it holding the trip's role.
 */
describe('BundleCard — opening a member', () => {
  it('hands the member to the board when it offers to take it, rather than navigating away', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderCard(MEMBERS, BUNDLE, () => {}, onOpen);

    await user.click(screen.getByRole('button', { name: 'Kaiseki counter' }));

    expect(onOpen).toHaveBeenCalledWith(92);
    expect(screen.queryByText('Entry detail screen')).not.toBeInTheDocument();
    // And the card is still there to open the next one from.
    expect(screen.getByRole('button', { name: 'Ramen alley' })).toBeInTheDocument();
  });

  // Outside a board — the design gallery — there is no drawer to open into, so
  // the card still has somewhere to send the reader.
  it('still navigates to the entry when no one offers to take it', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Kaiseki counter' }));

    expect(await screen.findByText('Entry detail screen')).toBeInTheDocument();
  });
});

/**
 * The design's rail card shows a count beside the name, a coloured dot beside
 * each item and a hint at the foot. Every one is derived from a real
 * serialized field — these tests pin that so nobody quietly swaps in an
 * invented one later.
 */
describe('BundleCard — the design anatomy, on real fields only', () => {
  it('counts its ideas in the header, right beside the name', () => {
    renderCard([entry(91, 'Ramen alley'), entry(92, 'Kaiseki counter')]);
    expect(screen.getByText('2 ideas')).toBeInTheDocument();
  });

  it('counts a lone idea in the singular', () => {
    renderCard([entry(91, 'Ramen alley')]);
    expect(screen.getByText('1 idea')).toBeInTheDocument();
  });

  // "Empty so far" is a state, not a tally: it is what the hint below the
  // members exists to fix, and it reads as an invitation rather than a zero.
  it('says an empty plan is empty so far, not "0 ideas"', () => {
    renderCard([]);
    expect(screen.getByText('Empty so far')).toBeInTheDocument();
    expect(screen.queryByText('0 ideas')).not.toBeInTheDocument();
  });

  // The card-level to-do total is retired with the redesign — the header meta
  // counts ideas, and the per-member labels below carry the open work.
  it('no longer states a card-level to-do total', () => {
    renderCard([entry(91, 'Ramen alley', 'idea', false, 3)]);
    expect(screen.queryByText(/open to-dos?/i)).not.toBeInTheDocument();
  });

  // The schedule answers this itself; the card's one line is worth more spent
  // on what the plan holds.
  it('no longer reports how many members are on the schedule', () => {
    renderCard([entry(91, 'Ramen alley', 'idea', true), entry(92, 'Kaiseki counter')]);
    expect(screen.queryByText(/\d+ of \d+ on the schedule/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/none on the schedule yet/i)).not.toBeInTheDocument();
  });

  // Colour is never the only carrier of meaning: the dot's state is also text.
  // The dot reads `address` — solid for a member that is a real place, hollow
  // for one that is not yet — never an invented state enum.
  it('gives each member dot a text equivalent, keyed to the address', () => {
    renderCard([
      entry(91, 'Ramen alley', 'idea', false, 0, '1 Ramen St, Kyoto'),
      entry(92, 'Kaiseki counter'),
    ]);
    expect(screen.getByText('Has an address:')).toBeInTheDocument();
    expect(screen.getByText('No address yet:')).toBeInTheDocument();
  });

  // The open work is traceable to the ideas that own it without opening one.
  it('labels the members that carry the open to-dos', () => {
    renderCard([
      entry(91, 'Ramen alley', 'idea', false, 2),
      entry(92, 'Kaiseki counter', 'idea', false, 1),
      entry(93, 'Standing sushi'),
    ]);
    expect(screen.getByText('2 to-dos')).toBeInTheDocument();
    expect(screen.getByText('1 to-do')).toBeInTheDocument();
  });

  // The design's foot line, on every editable card — plain text, because the
  // card has no add control of its own for it to be.
  it('hints at the two ways in at the foot of the card', () => {
    renderCard();
    expect(screen.getByText('+ add idea — or send one over from the list')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '+ add idea — or send one over from the list' }),
    ).not.toBeInTheDocument();
  });

  // A mark on the exceptions, not a column of zeroes.
  it('leaves members with nothing outstanding unlabelled', () => {
    renderCard();
    expect(screen.queryByText(/^\d+ to-dos?$/)).not.toBeInTheDocument();
  });

  // The card is content, not a toolbar: the whole plan-level action row is
  // gone, and so is the "N kept" tag that once sat beside the name.
  it('carries no action row and no "kept" tag', () => {
    renderCard();
    for (const label of [/^fork$/i, /^compare$/i, /^ungroup$/i, /^set aside$/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/kept/i)).not.toBeInTheDocument();
  });

  // Top right, which in the DOM means last — so a keyboard user reaches the
  // name (and everything the card is for) before the one destructive control.
  it('puts the remove control after the name, not in front of it', () => {
    renderCard();
    const name = screen.getByRole('button', { name: `Rename ${BUNDLE.title}` });
    const remove = screen.getByRole('button', { name: `Remove plan ${BUNDLE.title}` });
    expect(name.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/**
 * The card is the densest set of verbs on the board — rename, remove, reorder
 * twice over, unlink — and a viewer keeps none of them and loses none of the
 * card. Every test here asserts both halves.
 */
describe('BundleCard — reading along', () => {
  function renderAsViewer() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ToastProvider>
            <TripRoleProvider role="viewer">
              <DndContext>
                <BundleCard bundle={BUNDLE} members={MEMBERS} onToast={() => {}} />
              </DndContext>
            </TripRoleProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('shows the plan whole — its name, its count and every member in order', () => {
    renderAsViewer();

    expect(screen.getByText(BUNDLE.title)).toBeInTheDocument();
    expect(screen.getByText('3 ideas')).toBeInTheDocument();
    for (const member of MEMBERS) {
      expect(screen.getByRole('button', { name: member.title })).toBeInTheDocument();
    }
    // The foot hint names an editor's gestures, so a viewer's card ends with
    // the members.
    expect(screen.queryByText(/\+ add idea/)).not.toBeInTheDocument();
  });

  it('drops the name field, the remove control and every member verb', () => {
    renderAsViewer();

    expect(screen.queryByRole('button', { name: `Rename ${BUNDLE.title}` })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Remove plan ${BUNDLE.title}` })).not.toBeInTheDocument();
    for (const member of MEMBERS) {
      expect(screen.queryByRole('button', { name: `Move ${member.title} up` })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: `Move ${member.title} down` })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: `Remove ${member.title} from ${BUNDLE.title}` }),
      ).not.toBeInTheDocument();
    }
  });

  // Read-only styling does not stop a drag; the attribute has to go.
  it('takes the native drag attribute off every member row', () => {
    renderAsViewer();

    for (const item of screen.getAllByRole('listitem')) {
      expect(item).not.toHaveAttribute('draggable');
    }
  });

  it('says an empty plan is empty without naming gestures a viewer has not got', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ToastProvider>
            <TripRoleProvider role="viewer">
              <DndContext>
                <BundleCard bundle={BUNDLE} members={[]} onToast={() => {}} />
              </DndContext>
            </TripRoleProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Nothing in here yet.')).toBeInTheDocument();
    expect(screen.queryByText(/drag ideas here/i)).not.toBeInTheDocument();
  });

  // A viewer's member opens over the board too — which is the whole point of
  // opening it there: off the board it would be outside the trip's role, and
  // the drawer would hand them the form.
  it('opens a member in place rather than out of the trip a viewer is reading', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/board']}>
          <ToastProvider>
            <TripRoleProvider role="viewer">
              <DndContext>
                <Routes>
                  <Route
                    path="/board"
                    element={
                      <BundleCard bundle={BUNDLE} members={MEMBERS} onOpen={onOpen} onToast={() => {}} />
                    }
                  />
                  <Route path="/entries/:id" element={<p>Entry detail screen</p>} />
                </Routes>
              </DndContext>
            </TripRoleProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Ramen alley' }));

    expect(onOpen).toHaveBeenCalledWith(91);
    expect(screen.queryByText('Entry detail screen')).not.toBeInTheDocument();
  });

  it('leaves a member the whole card', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ToastProvider>
            <TripRoleProvider role="member">
              <DndContext>
                <BundleCard bundle={BUNDLE} members={MEMBERS} onToast={() => {}} />
              </DndContext>
            </TripRoleProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: `Rename ${BUNDLE.title}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Remove plan ${BUNDLE.title}` })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('draggable', 'true');
  });
});
