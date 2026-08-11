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
              compareIds={[]}
              onToggleCompare={() => {}}
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
    expect(screen.getByText('Drop ideas here to start a bundle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kyoto dinner options' })).toBeInTheDocument();
  });

  // The design's rail had Bundles | Map | This idea tabs; both other views are
  // out of scope, so the strip is gone rather than reduced to a single dead tab.
  it('shows no map or this-idea tab', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /^map$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /this idea/i })).not.toBeInTheDocument();
  });

  // Creating moved inline; the old modal trigger must be gone, not merely hidden.
  it('has no "New bundle" button opening a modal', () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: /new bundle/i })).not.toBeInTheDocument();
  });

  // Archiving is the reversible path, so the way back stays on the same screen.
  it('keeps set-aside bundles recoverable from the foot of the rail', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: /set aside · 1/i }));
    expect(screen.getByText('Rainy day plan')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick it back up' })).toBeInTheDocument();
  });

  it('invites a first bundle rather than showing an empty column', () => {
    renderPanel({ bundles: [], members: new Map() });
    expect(screen.getByText(/an empty bundle is a fine place to start/i)).toBeInTheDocument();
  });
});
