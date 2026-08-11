import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { BundleCard } from './BundleCard';
import { api } from '../../api';
import type { Entry } from '../../api/types';

function entry(
  id: number,
  title: string,
  kind: Entry['kind'] = 'idea',
  scheduled = false,
  todosOpen = 0,
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
    address: null,
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
    children_count: 0,
    todos_open_count: todosOpen,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled,
  };
}

const BUNDLE = entry(90, 'Kyoto dinner options', 'bundle');
const MEMBERS = [entry(91, 'Ramen alley'), entry(92, 'Kaiseki counter'), entry(93, 'Standing sushi')];

function renderCard(members = MEMBERS, bundle = BUNDLE, onToast: (message: string) => void = () => {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <DndContext>
            <BundleCard bundle={bundle} members={members} onToast={onToast} />
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
    const field = screen.getByRole('textbox', { name: 'Bundle name' });
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
    await user.clear(screen.getByRole('textbox', { name: 'Bundle name' }));
    await user.type(screen.getByRole('textbox', { name: 'Bundle name' }), 'Dinner, decided');
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
    await user.clear(screen.getByRole('textbox', { name: 'Bundle name' }));
    await user.type(screen.getByRole('textbox', { name: 'Bundle name' }), 'Something else{Escape}');

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
    await user.clear(screen.getByRole('textbox', { name: 'Bundle name' }));
    await user.type(screen.getByRole('textbox', { name: 'Bundle name' }), '   {Enter}');

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

    await user.click(screen.getByRole('button', { name: `Remove bundle ${BUNDLE.title}` }));

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

    await user.click(screen.getByRole('button', { name: `Remove bundle ${BUNDLE.title}` }));

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
 * The design's rail card shows a caption above the members, a count beside the
 * name and a coloured dot beside each item, all driven by state fields our
 * Entry does not have. Every one is derived from a real serialized field —
 * these tests pin that so nobody quietly swaps in an invented one later.
 */
describe('BundleCard — the design anatomy, on real fields only', () => {
  it('summarises how many members are already on the schedule', () => {
    renderCard([entry(91, 'Ramen alley', 'idea', true), entry(92, 'Kaiseki counter')]);
    expect(screen.getByText('1 of 2 on the schedule')).toBeInTheDocument();
  });

  it('says so plainly when nothing is scheduled, and stays silent for an empty bundle', () => {
    const { unmount } = renderCard([entry(91, 'Ramen alley')]);
    expect(screen.getByText('None on the schedule yet')).toBeInTheDocument();
    unmount();

    renderCard([]);
    expect(screen.queryByText(/on the schedule/i)).not.toBeInTheDocument();
  });

  // Colour is never the only carrier of meaning: the dot's state is also text.
  it('gives each member dot a text equivalent', () => {
    renderCard([entry(91, 'Ramen alley', 'idea', true), entry(92, 'Kaiseki counter')]);
    expect(screen.getByText('On the schedule:')).toBeInTheDocument();
    expect(screen.getByText('Not on the schedule yet:')).toBeInTheDocument();
  });

  it('adds up the open to-dos across the members and the bundle itself', () => {
    renderCard(
      [entry(91, 'Ramen alley', 'idea', false, 2), entry(92, 'Kaiseki counter', 'idea', false, 0)],
      entry(90, 'Kyoto dinner options', 'bundle', false, 1),
    );
    expect(screen.getByText('3 to-dos')).toBeInTheDocument();
  });

  it('counts a lone to-do in the singular', () => {
    renderCard([entry(91, 'Ramen alley', 'idea', false, 1)]);
    expect(screen.getByText('1 to-do')).toBeInTheDocument();
  });

  // Nothing outstanding is not news — it reads as silence, not as "0 to-dos".
  it('says nothing at all when there is no open work', () => {
    renderCard();
    expect(screen.queryByText(/to-do/i)).not.toBeInTheDocument();
  });

  // The card is content, not a toolbar: the whole bundle-level action row is
  // gone, and so is the idea count that sat beside the name.
  it('carries no action row and no idea count', () => {
    renderCard();
    for (const label of [/^fork$/i, /^compare$/i, /^ungroup$/i, /^set aside$/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/kept/i)).not.toBeInTheDocument();
  });
});
