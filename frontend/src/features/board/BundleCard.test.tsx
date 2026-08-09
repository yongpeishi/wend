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

function entry(id: number, title: string, kind: Entry['kind'] = 'idea'): Entry {
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
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
  };
}

const BUNDLE = entry(90, 'Kyoto dinner options', 'bundle');
const MEMBERS = [entry(91, 'Ramen alley'), entry(92, 'Kaiseki counter'), entry(93, 'Standing sushi')];

function renderCard(members = MEMBERS) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <DndContext>
            <BundleCard
              bundle={BUNDLE}
              members={members}
              compareSelected={false}
              onToggleCompare={() => {}}
              onToast={() => {}}
            />
          </DndContext>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BundleCard — bundle CRUD', () => {
  it('renames a bundle through the edit modal', async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ entry: { ...BUNDLE, title: 'Dinner, decided' } });
    renderCard();

    await user.click(screen.getByRole('button', { name: `Rename ${BUNDLE.title}` }));

    const nameField = await screen.findByDisplayValue(BUNDLE.title);
    await user.clear(nameField);
    await user.type(nameField, 'Dinner, decided');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [path, body] = patch.mock.calls[0] as [string, { entry: { title: string } }];
    expect(path).toContain(`/entries/${BUNDLE.id}`);
    expect(body.entry.title).toBe('Dinner, decided');
    patch.mockRestore();
  });

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

  it('sets a bundle aside rather than destroying it', async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ entry: { ...BUNDLE, archived_at: 'now' } });
    renderCard();

    await user.click(screen.getByRole('button', { name: /set aside/i }));

    await waitFor(() => expect(del).toHaveBeenCalledWith(`/entries/${BUNDLE.id}`));
    // Archiving is a DELETE that soft-archives server-side; the UI never
    // exposes a permanent destroy.
    expect(screen.queryByRole('button', { name: /delete permanently/i })).not.toBeInTheDocument();
    del.mockRestore();
  });
});
