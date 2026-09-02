import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../../components/Toast';
import { TripRoleProvider } from '../../auth/TripRoleContext';
import { BundleCard } from './BundleCard';
import { useBundleMembers } from './useBundleMembers';
import { api, queryKeys } from '../../api';
import { server } from '../../mocks/server';
import type { Entry, EntryDetailResponse } from '../../api/types';
import styles from './BundleCard.module.css';

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
// The trip the card's plan nests under — where an idea made from the foot's
// "+ add idea" field is created before it is linked in.
const TRIP_ID = 7;

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
                element={
                  <BundleCard bundle={bundle} tripId={TRIP_ID} members={members} onOpen={onOpen} onToast={onToast} />
                }
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

/**
 * The card's members in the cache, the way the board holds them: BundleCard
 * takes `members` as a prop, so for a reorder to be seen moving the rows —
 * and moving back when the server refuses — the card has to be fed from the
 * same detail query the optimistic link cache edits.
 */
const PLANS = [BUNDLE];

function detailOf(children: Entry[]): EntryDetailResponse {
  return { entry: BUNDLE, parents: [], children, todos: [], votes: [], collaborators_count: 0 };
}

function CardFromCache() {
  const members = useBundleMembers(PLANS).get(BUNDLE.id) ?? [];
  return <BundleCard bundle={BUNDLE} tripId={TRIP_ID} members={members} onToast={() => {}} />;
}

function renderCardFromCache() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.entries.detail(BUNDLE.id), detailOf(MEMBERS));
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <DndContext>
            <CardFromCache />
          </DndContext>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const MEMBER_NAME = /^(Ramen alley|Kaiseki counter|Standing sushi)$/;

/** The members as the DOM shows them, top to bottom. */
function memberTitles(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((row) => within(row).getByRole('button', { name: MEMBER_NAME }).textContent ?? '');
}

/** A hand-held gate: the request waits at the mock until the test lets it go. */
function gate() {
  let release: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { opened, release: () => release() };
}

/**
 * Answers the plan's reorder POST and its detail GET from one shared order,
 * recording every reorder body. `respond` decides what the POST says after
 * the (optional) gate opens — a success moves the served order along, so the
 * refetch that follows a settled mutation agrees with the optimistic rows.
 */
function serveReorder(
  options: { status?: number; wait?: Promise<void> } = {},
): { bodies: number[][] } {
  const bodies: number[][] = [];
  let order = MEMBERS;
  server.use(
    http.get(`/api/entries/${BUNDLE.id}`, () => HttpResponse.json(detailOf(order))),
    http.post(`/api/entries/${BUNDLE.id}/links/reorder`, async ({ request }) => {
      const body = (await request.json()) as { child_ids: number[] };
      bodies.push(body.child_ids);
      if (options.wait) await options.wait;
      if (options.status && options.status >= 400) {
        return HttpResponse.json({ error: 'no' }, { status: options.status });
      }
      order = body.child_ids.map((id) => MEMBERS.find((m) => m.id === id) as Entry);
      return HttpResponse.json({ links: [] });
    }),
  );
  return { bodies };
}

/** jsdom lays nothing out, so every row is told it is 40px tall at the top of the page. */
function stubRowRects() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 40,
    width: 0,
    height: 40,
    toJSON: () => ({}),
  } as DOMRect);
}

/**
 * A dragover carrying a pointer position. testing-library's fireEvent.dragOver
 * falls back to a bare Event in jsdom (no DragEvent there), which drops
 * clientY on the floor; a MouseEvent of the same name keeps it, and React
 * routes it to onDragOver all the same.
 */
function dragOverAt(target: Element, clientY: number) {
  fireEvent(target, new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY }));
}

/** The card's own announcer — dnd-kit's DndContext mounts a status region of its own. */
function liveRegion(): HTMLElement {
  const own = screen.getAllByRole('status').find((el) => el.classList.contains(styles.srOnly));
  if (!own) throw new Error('The card has no live region');
  return own;
}

const SAVE_FAILED = "That didn't save. It's still here — try again.";

describe('BundleCard — reordering and unlinking members', () => {
  // The whole point of the preview: the line answers "above or below?" while
  // the row is still in hand, and the drop sends the one order it promised.
  it('shows where a dragged row will land, then posts that order once', async () => {
    const rects = stubRowRects();
    const { bodies } = serveReorder();
    renderCardFromCache();
    const rows = await screen.findAllByRole('listitem');
    const [ramen, , sushi] = rows as [HTMLElement, HTMLElement, HTMLElement];

    fireEvent.dragStart(ramen);
    expect(ramen).toHaveClass(styles.lifted);

    // Upper half of the last row: the seam above it.
    dragOverAt(sushi, 10);
    expect(sushi).toHaveClass(styles.insertBefore);
    expect(sushi).not.toHaveClass(styles.insertAfter);

    // Across the midline: the seam below it.
    dragOverAt(sushi, 30);
    expect(sushi).toHaveClass(styles.insertAfter);
    expect(sushi).not.toHaveClass(styles.insertBefore);

    fireEvent.drop(sushi);

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual([92, 93, 91]);
    for (const row of screen.getAllByRole('listitem')) {
      expect(row).not.toHaveClass(styles.insertBefore);
      expect(row).not.toHaveClass(styles.insertAfter);
      expect(row).not.toHaveClass(styles.lifted);
    }
    rects.mockRestore();
  });

  // Unresponsive was the complaint: the row moves the moment it is dropped,
  // while the request is still on the wire.
  it('moves the row on screen before the server has answered', async () => {
    const rects = stubRowRects();
    const saving = gate();
    const { bodies } = serveReorder({ wait: saving.opened });
    renderCardFromCache();
    const rows = await screen.findAllByRole('listitem');
    const [ramen, , sushi] = rows as [HTMLElement, HTMLElement, HTMLElement];

    fireEvent.dragStart(ramen);
    dragOverAt(sushi, 30);
    fireEvent.drop(sushi);

    await waitFor(() => expect(memberTitles()).toEqual(['Kaiseki counter', 'Standing sushi', 'Ramen alley']));
    await waitFor(() => expect(bodies).toHaveLength(1));
    saving.release();
    // And it stays there once the server agrees.
    await waitFor(() => expect(memberTitles()).toEqual(['Kaiseki counter', 'Standing sushi', 'Ramen alley']));
    rects.mockRestore();
  });

  // Going home draws no line and sends nothing — a request that changes
  // nothing still fades the row and still has a way to fail.
  it('draws nothing and sends nothing when the row is dropped back where it was', async () => {
    const rects = stubRowRects();
    const { bodies } = serveReorder();
    renderCard();
    const rows = screen.getAllByRole('listitem');
    const [ramen, kaiseki] = rows as [HTMLElement, HTMLElement];

    fireEvent.dragStart(ramen);
    // The seam between the first two rows is one of the two hugging the row in hand.
    dragOverAt(kaiseki, 10);
    expect(kaiseki).not.toHaveClass(styles.insertBefore);
    fireEvent.drop(kaiseki);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bodies).toHaveLength(0);
    rects.mockRestore();
  });

  // The grip is the keyboard's route to the same preview: lift, step, drop.
  it('lifts a row from its grip, steps it with the arrows, and drops it with Space', async () => {
    const { bodies } = serveReorder();
    renderCard();
    const grip = screen.getByRole('button', { name: 'Reorder Ramen alley' });
    grip.focus();

    fireEvent.keyDown(grip, { key: ' ' });
    expect(grip).toHaveAttribute('aria-pressed', 'true');
    expect(grip).toHaveClass(styles.gripOn);
    expect(liveRegion()).toHaveTextContent(
      'Moving Ramen alley. Will land at 1 of 3. Space to drop, Escape to cancel.',
    );

    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    expect(liveRegion()).toHaveTextContent(
      'Moving Ramen alley. Will land at 2 of 3. Space to drop, Escape to cancel.',
    );
    // Landing second means the seam above the third row.
    const rows = screen.getAllByRole('listitem');
    expect(rows[2]).toHaveClass(styles.insertBefore);
    expect(rows[1]).not.toHaveClass(styles.insertBefore);

    fireEvent.keyDown(grip, { key: ' ' });

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual([92, 91, 93]);
    expect(liveRegion()).toHaveTextContent('Moved Ramen alley to 2 of 3.');
    expect(grip).toHaveAttribute('aria-pressed', 'false');
  });

  it('puts a lifted row back on Escape without asking the server anything', async () => {
    const { bodies } = serveReorder();
    renderCard();
    const grip = screen.getByRole('button', { name: 'Reorder Kaiseki counter' });
    grip.focus();

    fireEvent.keyDown(grip, { key: ' ' });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    fireEvent.keyDown(grip, { key: 'Escape' });

    expect(grip).toHaveAttribute('aria-pressed', 'false');
    for (const row of screen.getAllByRole('listitem')) {
      expect(row).not.toHaveClass(styles.insertBefore);
      expect(row).not.toHaveClass(styles.insertAfter);
      expect(row).not.toHaveClass(styles.lifted);
    }
    expect(liveRegion()).toHaveTextContent('');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bodies).toHaveLength(0);
  });

  // The buttons that always work — mouse, keyboard or switch — send the same
  // single order a drop does, not two position writes racing each other.
  it('moves a member up with one reorder request carrying the whole new order', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'patch');
    const { bodies } = serveReorder();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Move Kaiseki counter up' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual([92, 91, 93]);
    expect(patch).not.toHaveBeenCalled();
    patch.mockRestore();
  });

  it('moves a member down the same way', async () => {
    const user = userEvent.setup();
    const { bodies } = serveReorder();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Move Ramen alley down' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual([92, 91, 93]);
  });

  // Optimism has to be honest: a refused save slides the row back and says so
  // in the house words — once.
  it('slides the row back and says the house sentence when the reorder does not save', async () => {
    const user = userEvent.setup();
    const saving = gate();
    serveReorder({ status: 500, wait: saving.opened });
    renderCardFromCache();
    await screen.findAllByRole('listitem');

    await user.click(screen.getByRole('button', { name: 'Move Kaiseki counter up' }));

    await waitFor(() => expect(memberTitles()).toEqual(['Kaiseki counter', 'Ramen alley', 'Standing sushi']));
    saving.release();

    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument();
    await waitFor(() => expect(memberTitles()).toEqual(['Ramen alley', 'Kaiseki counter', 'Standing sushi']));
    expect(screen.getAllByText(SAVE_FAILED)).toHaveLength(1);
  });

  // "No indication of loading" was the other half of the complaint: the moved
  // row fades while its save is out, and only that row.
  it('fades the moved row while the save is in flight, and only that row', async () => {
    const user = userEvent.setup();
    const saving = gate();
    serveReorder({ wait: saving.opened });
    renderCard();
    const kaiseki = screen.getByRole('button', { name: 'Kaiseki counter' }).closest('li') as HTMLElement;
    const ramen = screen.getByRole('button', { name: 'Ramen alley' }).closest('li') as HTMLElement;

    await user.click(screen.getByRole('button', { name: 'Move Kaiseki counter up' }));

    await waitFor(() => expect(kaiseki).toHaveClass(styles.pending));
    expect(ramen).not.toHaveClass(styles.pending);
    saving.release();
    await waitFor(() => expect(kaiseki).not.toHaveClass(styles.pending));
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
 * The foot's "+ add idea" is a real control: the button swaps in place for a
 * name field, and a name makes two writes in a fixed order — the idea is
 * created under the trip first, then linked into this bundle, because the
 * link needs the new idea's id.
 */
describe('BundleCard — adding an idea from the foot', () => {
  it('creates the idea under the trip, then links it into the plan, on Enter', async () => {
    const user = userEvent.setup();
    const created = entry(99, 'Izakaya crawl');
    const post = vi
      .spyOn(api, 'post')
      .mockImplementation((path: string) =>
        Promise.resolve(path === '/entries' ? { entry: created } : { link: {} }),
      );
    const onToast = vi.fn();
    renderCard(MEMBERS, BUNDLE, onToast);

    await user.click(screen.getByRole('button', { name: '+ add idea — or send one over from the list' }));
    await user.type(screen.getByRole('textbox', { name: 'New idea name' }), 'Izakaya crawl{Enter}');

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/entries', {
        entry: { kind: 'idea', title: 'Izakaya crawl' },
        parent_id: TRIP_ID,
      }),
    );
    await waitFor(() => expect(post).toHaveBeenCalledWith(`/entries/${BUNDLE.id}/links`, { child_id: 99 }));
    // The entry exists before the link that needs its id.
    expect(post.mock.calls[0]?.[0]).toBe('/entries');
    await waitFor(() => expect(onToast).toHaveBeenCalledWith(`Added Izakaya crawl to ${BUNDLE.title}.`));
    // The field has done its job and the button is back for the next idea.
    expect(
      await screen.findByRole('button', { name: '+ add idea — or send one over from the list' }),
    ).toBeInTheDocument();
    post.mockRestore();
  });

  it('puts the button back on Escape without writing anything', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ entry: {} });
    renderCard();

    await user.click(screen.getByRole('button', { name: '+ add idea — or send one over from the list' }));
    await user.type(screen.getByRole('textbox', { name: 'New idea name' }), 'Half a thought{Escape}');

    expect(post).not.toHaveBeenCalled();
    const restored = await screen.findByRole('button', {
      name: '+ add idea — or send one over from the list',
    });
    // A keyboard user is put back where they were, not at the top of the page.
    await waitFor(() => expect(restored).toHaveFocus());
    post.mockRestore();
  });

  // The same refusal as the rename field: a blank is not an idea, so the
  // field simply closes and nothing needs explaining.
  it('refuses a blank name rather than creating a nameless idea', async () => {
    const user = userEvent.setup();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ entry: {} });
    renderCard();

    await user.click(screen.getByRole('button', { name: '+ add idea — or send one over from the list' }));
    await user.type(screen.getByRole('textbox', { name: 'New idea name' }), '   {Enter}');

    expect(post).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: '+ add idea — or send one over from the list' }),
    ).toBeInTheDocument();
    post.mockRestore();
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

  // The card-level total is back (the product owner reversed its retirement):
  // the members' open to-dos summed, as one text node under the name, kept
  // alongside the per-member labels that say which ideas own the work.
  it('totals the members\' open to-dos in the line under the name', () => {
    renderCard([entry(91, 'Ramen alley', 'idea', false, 3), entry(92, 'Kaiseki counter', 'idea', false, 2)]);
    expect(screen.getByText('5 open to-dos')).toBeInTheDocument();
  });

  it('counts a lone open to-do in the singular', () => {
    renderCard([entry(91, 'Ramen alley', 'idea', false, 1)]);
    expect(screen.getByText('1 open to-do')).toBeInTheDocument();
  });

  // Zero renders too — in a rail where some cards speak and some stay silent,
  // "nothing outstanding" is a real answer about a plan, not an absence.
  it('says "0 open to-dos" rather than staying silent', () => {
    renderCard([entry(91, 'Ramen alley')]);
    expect(screen.getByText('0 open to-dos')).toBeInTheDocument();
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

  // The design's foot line, on every editable card — a real button now,
  // because the card grew an add-member write of its own.
  it('offers the ways in at the foot of the card as a real button', () => {
    renderCard();
    expect(
      screen.getByRole('button', { name: '+ add idea — or send one over from the list' }),
    ).toBeInTheDocument();
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
                <BundleCard bundle={BUNDLE} tripId={TRIP_ID} members={MEMBERS} onToast={() => {}} />
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
      expect(screen.queryByRole('button', { name: `Reorder ${member.title}` })).not.toBeInTheDocument();
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
                <BundleCard bundle={BUNDLE} tripId={TRIP_ID} members={[]} onToast={() => {}} />
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
                      <BundleCard bundle={BUNDLE} tripId={TRIP_ID} members={MEMBERS} onOpen={onOpen} onToast={() => {}} />
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
                <BundleCard bundle={BUNDLE} tripId={TRIP_ID} members={MEMBERS} onToast={() => {}} />
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
