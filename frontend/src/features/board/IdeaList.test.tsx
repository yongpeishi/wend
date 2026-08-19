import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DndContext } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/Toast';
import { IdeaList } from './IdeaList';
import type { GroupMode } from './filters';
import type { Entry } from '../../api/types';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'idea',
    title: 'Untitled',
    description: null,
    category: null,
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
    created_at: '',
    updated_at: '',
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
    ...overrides,
  };
}

const ENTRIES = [
  makeEntry({ id: 1, title: 'Fushimi Inari', category: 'place', location_name: 'Kyoto south', duration_minutes: 120 }),
  makeEntry({ id: 2, title: 'Nishiki Market', category: 'food', location_name: 'Kyoto central' }),
  makeEntry({ id: 3, title: 'Kinkaku-ji', category: 'place', location_name: 'Kyoto west', todos_open_count: 2 }),
  makeEntry({ id: 4, title: 'Somewhere unplaced', category: 'other' }),
];

function renderList(
  groupMode: GroupMode,
  entries = ENTRIES,
  extra: { selectMode?: boolean; selectedIds?: number[]; canEdit?: boolean } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <DndContext>
            <IdeaList
              entries={entries}
              groupMode={groupMode}
              bundles={[]}
              members={new Map()}
              selectMode={extra.selectMode}
              selectedIds={extra.selectedIds ?? []}
              onToggleSelect={() => {}}
              canEdit={extra.canEdit}
            />
          </DndContext>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Group headings, in render order, without their trailing count. */
function groupLabels(): string[] {
  return screen
    .getAllByRole('heading', { level: 3 })
    .map((heading) => (heading.textContent ?? '').replace(/\d+ ideas?.*$/, '').trim());
}

describe('IdeaList', () => {
  it('renders a flat list with no headings when ungrouped', () => {
    renderList('none');
    expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('sections by place, alphabetically, with the unplaced idea under "No location" last', () => {
    renderList('location');
    expect(groupLabels()).toEqual(['Kyoto central', 'Kyoto south', 'Kyoto west', 'No location']);
  });

  it('sections by category in the same shape', () => {
    renderList('category');
    expect(groupLabels()).toEqual(['Place', 'Food', 'Other']);
  });

  it('counts its ideas in the header, so a fold never hides the total', async () => {
    const user = userEvent.setup();
    renderList('category');

    const placeHeader = screen.getByRole('button', { name: /^Place/ });
    expect(placeHeader).toHaveTextContent('2 ideas');

    await user.click(placeHeader);
    expect(placeHeader).toHaveTextContent('2 ideas');
  });

  it('says "1 idea" rather than "1 ideas"', () => {
    renderList('location');
    expect(screen.getByRole('button', { name: /^Kyoto south/ })).toHaveTextContent('1 idea');
  });

  it('collapses and reopens a group, announcing it with aria-expanded', async () => {
    const user = userEvent.setup();
    renderList('location');

    const header = screen.getByRole('button', { name: /^Kyoto south/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /^Fushimi Inari/ })).not.toBeInTheDocument();

    await user.click(header);
    expect(header).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).toBeInTheDocument();
  });

  it('points aria-controls at the panel it actually folds', () => {
    renderList('location');
    const header = screen.getByRole('button', { name: /^Kyoto south/ });
    const panelId = header.getAttribute('aria-controls') as string;
    const panel = document.getElementById(panelId);

    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByRole('button', { name: /^Fushimi Inari/ })).toBeInTheDocument();
  });

  it('folds one group at a time, leaving its neighbours open', async () => {
    const user = userEvent.setup();
    renderList('location');

    await user.click(screen.getByRole('button', { name: /^Kyoto south/ }));

    expect(screen.getByRole('button', { name: /^Kyoto west/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Kinkaku-ji/ })).toBeInTheDocument();
  });

  it('leaves every row with its drag handle, not a checkbox, until the board says otherwise', () => {
    renderList('none');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('hands select mode to every row it renders, grouped or not', () => {
    renderList('category', ENTRIES, { selectMode: true, selectedIds: [2] });

    expect(screen.getAllByRole('checkbox')).toHaveLength(ENTRIES.length);
    expect(screen.getByRole('checkbox', { name: 'Select Nishiki Market' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Fushimi Inari' })).not.toBeChecked();
  });

  it('renders every entry it is given, in every mode — grouping hides nothing', () => {
    for (const mode of ['none', 'category', 'location'] as const) {
      const view = renderList(mode);
      for (const entry of ENTRIES) {
        expect(screen.getByRole('button', { name: new RegExp(`^${entry.title}`) })).toBeInTheDocument();
      }
      view.unmount();
    }
  });

  /**
   * The list draws no affordance of its own — it only has to hand the
   * capability on. The proof is at the rows: no grips, no ⋯ menus, and every
   * idea still there to read.
   */
  it('passes read-only down to every row, in every grouping, without losing an idea', () => {
    for (const mode of ['none', 'category', 'location'] as const) {
      const view = renderList(mode, ENTRIES, { canEdit: false });

      for (const entry of ENTRIES) {
        expect(screen.getByRole('button', { name: new RegExp(`^${entry.title}`) })).toBeInTheDocument();
      }
      expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Actions for / })).not.toBeInTheDocument();

      view.unmount();
    }
  });

  it('leaves the rows their affordances by default, so nothing outside a trip changes', () => {
    renderList('none');
    expect(screen.getAllByRole('button', { name: /^Drag / })).toHaveLength(ENTRIES.length);
    expect(screen.getAllByRole('button', { name: /^Actions for / })).toHaveLength(ENTRIES.length);
  });
});
