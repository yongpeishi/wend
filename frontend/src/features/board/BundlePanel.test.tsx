import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { TripRoleProvider } from '../../auth/TripRoleContext';
import { BundlePanel } from './BundlePanel';
import type { Entry } from '../../api/types';

function entry(id: number, title: string, kind: Entry['kind'] = 'idea', scheduled = false): Entry {
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
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled,
  };
}

const BUNDLE = entry(90, 'Kyoto dinner options', 'bundle');
const ARCHIVED = { ...entry(95, 'Rainy day plan', 'bundle'), archived_at: '2026-02-02T00:00:00Z' };
const MEMBERS = [entry(91, 'Ramen alley', 'idea', true), entry(92, 'Kaiseki counter')];

function renderPanel(overrides: Partial<Parameters<typeof BundlePanel>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <DndContext>
            <BundlePanel
              tripId={7}
              bundles={[BUNDLE]}
              archivedBundles={[ARCHIVED]}
              members={new Map([[BUNDLE.id, MEMBERS]])}
              loading={false}
              onToast={() => {}}
              {...overrides}
            />
          </DndContext>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BundlePanel — the bundles-only rail', () => {
  it('names itself, explains what a bundle is, and lists the bundles', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Bundles' })).toBeInTheDocument();
    expect(screen.getByText(/A bundle is a group of things that go well together/)).toBeInTheDocument();
    // The card's name is now the rename control itself, so it announces as one.
    expect(screen.getByRole('button', { name: 'Rename Kyoto dinner options' })).toBeInTheDocument();
  });

  // The visible <h2> is the region's name. A hardcoded aria-label alongside it
  // would be a second, competing one that nothing on screen can keep honest.
  it('takes its landmark name from the visible heading', () => {
    renderPanel();
    const rail = screen.getByRole('complementary', { name: 'Bundles' });
    expect(rail).toHaveAttribute('aria-labelledby', screen.getByRole('heading', { name: 'Bundles' }).id);
  });

  // The dashed target made a bundle out of a gesture that is easy to miss by
  // twenty pixels. Dropping onto a bundle that exists is untouched.
  it('offers no dashed drop target for starting a bundle', () => {
    renderPanel();
    expect(screen.queryByText(/Drop ideas here to start a bundle/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create new bundle' })).not.toBeInTheDocument();
  });

  // The design's rail had Bundles | Map | This idea tabs; both other views are
  // out of scope, so the strip is gone rather than reduced to a single dead tab.
  it('shows no map or this-idea tab', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /^map$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /this idea/i })).not.toBeInTheDocument();
  });

  // The header's action opens a row in the rail, never a dialog over it:
  // creating a bundle is a one-field edit of the thing you are already looking
  // at, and covering the board to make it is more ceremony than it is worth.
  it('opens a naming row in the rail rather than a modal', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: '+ New bundle' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name a new bundle')).toBeInTheDocument();
  });

  // Anything you just made should be the first thing you see, so the form that
  // makes it opens where it will land.
  it('puts the naming row above the bundles it will join', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: '+ New bundle' }));

    const rail = screen.getByRole('complementary', { name: 'Bundles' });
    // querySelectorAll returns document order, which is the order these read in.
    const inOrder = Array.from(rail.querySelectorAll('input, button[aria-label^="Rename "]'));
    const field = screen.getByLabelText('Name a new bundle');
    const firstCard = screen.getByRole('button', { name: 'Rename Kyoto dinner options' });
    expect(inOrder.indexOf(field)).toBeLessThan(inOrder.indexOf(firstCard));
  });

  // /entries sorts by id ascending for every kind on the board, so the rail
  // reverses it here — the newest bundle is the one you were just working on.
  it('lists the newest bundle first', () => {
    const older = { ...BUNDLE, id: 10, title: 'Older bundle' };
    const newer = { ...BUNDLE, id: 20, title: 'Newer bundle' };
    renderPanel({ bundles: [older, newer], members: new Map() });

    const names = screen
      .getAllByRole('button', { name: /^Rename / })
      .map((button) => button.textContent);
    expect(names).toEqual(['Newer bundle', 'Older bundle']);
  });

  // Archiving is the reversible path, so the way back stays on the same screen.
  it('keeps set-aside bundles recoverable from the foot of the rail', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /set aside · 1/i }));
    expect(screen.getByText('Rainy day plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick it back up' })).toBeInTheDocument();
  });

  // The rail is meant to read as the bundles themselves, not as a stack of
  // toolbars — the card-level action row was removed wholesale.
  it('offers no bundle action row on the cards', () => {
    renderPanel();
    for (const label of [/^fork$/i, /^compare$/i, /^ungroup$/i, /^set aside$/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  // The rail carries the board's opener down to every card, so a member opens
  // over the board rather than at a page of its own.
  it('reaches a member with the board\'s way of opening one', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderPanel({ onOpen });

    await user.click(screen.getByRole('button', { name: 'Kaiseki counter' }));

    expect(onOpen).toHaveBeenCalledWith(92);
  });

  it('invites a first bundle rather than showing an empty column', () => {
    renderPanel({ bundles: [], members: new Map() });
    expect(screen.getByText(/an empty bundle is a fine place to start/i)).toBeInTheDocument();
  });
});

/**
 * The rail is where a trip's thinking is grouped, so a viewer keeps all of it —
 * including what was set aside, which is part of the story. What goes is the
 * one action the header owns, and the way back out of the archive.
 */
describe('BundlePanel — reading along', () => {
  function renderAsViewer(overrides: Partial<Parameters<typeof BundlePanel>[0]> = {}) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ToastProvider>
            <TripRoleProvider role="viewer">
              <DndContext>
                <BundlePanel
                  tripId={7}
                  bundles={[BUNDLE]}
                  archivedBundles={[ARCHIVED]}
                  members={new Map([[BUNDLE.id, MEMBERS]])}
                  loading={false}
                  onToast={() => {}}
                  {...overrides}
                />
              </DndContext>
            </TripRoleProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('keeps the rail whole — its heading, what a bundle is, and every bundle in it', () => {
    renderAsViewer();

    expect(screen.getByRole('heading', { name: 'Bundles' })).toBeInTheDocument();
    expect(screen.getByText(/a bundle is a group of things that go well together/i)).toBeInTheDocument();
    expect(screen.getByText(BUNDLE.title)).toBeInTheDocument();
    for (const member of MEMBERS) {
      expect(screen.getByRole('button', { name: member.title })).toBeInTheDocument();
    }
  });

  it('takes away "+ New bundle"', () => {
    renderAsViewer();
    expect(screen.queryByRole('button', { name: '+ New bundle' })).not.toBeInTheDocument();
  });

  it('still discloses what was set aside, and still names it — only the way back goes', async () => {
    const user = userEvent.setup();
    renderAsViewer();

    await user.click(screen.getByRole('button', { name: /Set aside · 1/ }));

    expect(screen.getByText(ARCHIVED.title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pick it back up' })).not.toBeInTheDocument();
  });

  // The empty rail's copy used to send everyone to a header action a viewer
  // never gets. An empty rail is simply what this trip looks like to them.
  it('states an empty rail rather than pointing at an action that is not there', () => {
    renderAsViewer({ bundles: [], members: new Map() });

    expect(screen.getByText('No bundles on this trip yet.')).toBeInTheDocument();
    expect(screen.queryByText(/start one/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/an empty bundle is a fine place to start/i)).not.toBeInTheDocument();
  });

  it('still invites an editor to start the first one', () => {
    renderPanel({ bundles: [], members: new Map() });

    expect(
      screen.getByText(
        'No bundles yet. Start one from the top of this rail — an empty bundle is a fine place to start.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('No bundles on this trip yet.')).not.toBeInTheDocument();
  });

  it('leaves an owner the action and the way back', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByRole('button', { name: '+ New bundle' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Set aside · 1/ }));
    expect(screen.getByRole('button', { name: 'Pick it back up' })).toBeInTheDocument();
  });
});
