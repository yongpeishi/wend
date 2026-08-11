import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
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
  it('explains what a bundle is and offers the drop box above the list', () => {
    renderPanel();
    expect(screen.getByText(/A bundle is a group of things that go well together/)).toBeInTheDocument();
    expect(screen.getByText(/Drop ideas here to start a bundle/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new bundle' })).toBeInTheDocument();
    // The card's name is now the rename control itself, so it announces as one.
    expect(screen.getByRole('button', { name: 'Rename Kyoto dinner options' })).toBeInTheDocument();
  });

  // The design's rail had Bundles | Map | This idea tabs; both other views are
  // out of scope, so the strip is gone rather than reduced to a single dead tab.
  it('shows no map or this-idea tab', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /^map$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /this idea/i })).not.toBeInTheDocument();
  });

  // Creating moved inline; the old modal trigger must be gone, not merely
  // hidden. "Create new bundle" is the inline path, not that button — it opens
  // a naming box in the rail, never a dialog over it.
  it('has no "New bundle" button opening a modal', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(screen.queryByRole('button', { name: /^\+? ?new bundle$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create new bundle' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name a new bundle')).toBeInTheDocument();
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

  it('invites a first bundle rather than showing an empty column', () => {
    renderPanel({ bundles: [], members: new Map() });
    expect(screen.getByText(/an empty bundle is a fine place to start/i)).toBeInTheDocument();
  });
});
