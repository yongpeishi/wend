import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    parent_ids: [],
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

interface ListExtras {
  selectMode?: boolean;
  selectedIds?: number[];
  canEdit?: boolean;
  insideCounts?: ReadonlyMap<number, number>;
  otherParents?: ReadonlyMap<number, string[]>;
  onDrill?: (id: number) => void;
  expandedIds?: ReadonlySet<number>;
  onToggleExpand?: (id: number) => void;
  focusedId?: number | null;
  onFocusRow?: (id: number) => void;
  composerAt?: number | null;
  onOpenComposerInside?: (id: number) => void;
  onComposerSubmit?: () => void;
  onComposerCancel?: () => void;
}

function renderList(groupMode: GroupMode, entries = ENTRIES, extra: ListExtras = {}) {
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
              insideCounts={extra.insideCounts ?? new Map()}
              otherParents={extra.otherParents ?? new Map()}
              allIdeas={entries}
              onDrill={extra.onDrill ?? (() => {})}
              expandedIds={extra.expandedIds ?? new Set()}
              onToggleExpand={extra.onToggleExpand ?? (() => {})}
              focusedId={extra.focusedId ?? null}
              onFocusRow={extra.onFocusRow ?? (() => {})}
              composerAt={extra.composerAt ?? null}
              onOpenComposerInside={extra.onOpenComposerInside ?? (() => {})}
              onComposerSubmit={extra.onComposerSubmit ?? (() => {})}
              onComposerCancel={extra.onComposerCancel ?? (() => {})}
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
   * capability on. The proof is at the rows: no grips, and every idea still
   * there to read.
   */
  it('passes read-only down to every row, in every grouping, without losing an idea', () => {
    for (const mode of ['none', 'category', 'location'] as const) {
      const view = renderList(mode, ENTRIES, { canEdit: false });

      for (const entry of ENTRIES) {
        expect(screen.getByRole('button', { name: new RegExp(`^${entry.title}`) })).toBeInTheDocument();
      }
      expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument();

      view.unmount();
    }
  });

  it('leaves the rows their affordances by default, so nothing outside a trip changes', () => {
    renderList('none');
    expect(screen.getAllByRole('button', { name: /^Drag / })).toHaveLength(ENTRIES.length);
  });

  /**
   * The per-entry maps and the drill/expand pair are the board's, and the list
   * only threads them — but the threading is exactly what can silently break,
   * so each leg is pinned at the rows.
   */
  describe('threading the board state to the rows', () => {
    it('gives each row its own inside count, and no pill where the map is silent', () => {
      renderList('none', ENTRIES, { insideCounts: new Map([[1, 3]]) });

      expect(screen.getByRole('button', { name: '3 inside ›' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /inside ›$/ })).toHaveLength(1);
    });

    it('gives each row its own "also in" names', () => {
      renderList('none', ENTRIES, { otherParents: new Map([[2, ['Food crawl']]]) });

      expect(screen.getByText('also in: Food crawl')).toBeInTheDocument();
      expect(screen.getAllByText(/^also in:/)).toHaveLength(1);
    });

    it('opens exactly the rows the board names, in grouped modes too', () => {
      renderList('category', ENTRIES, { expandedIds: new Set([3]) });

      expect(screen.getByRole('button', { name: /^Kinkaku-ji/ })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByRole('button', { name: /^Nishiki Market/ })).toHaveAttribute('aria-expanded', 'false');
    });

    it('holds several rows open at once when the board names several', () => {
      renderList('none', ENTRIES, { expandedIds: new Set([1, 3]) });

      expect(screen.getByRole('button', { name: /^Fushimi Inari/ })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: /^Kinkaku-ji/ })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: /^Nishiki Market/ })).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens nothing when the board names nothing', () => {
      renderList('none', ENTRIES, { expandedIds: new Set() });
      for (const entry of ENTRIES) {
        expect(screen.getByRole('button', { name: new RegExp(`^${entry.title}`) })).toHaveAttribute(
          'aria-expanded',
          'false',
        );
      }
    });

    it('reports which row was clicked, and decides nothing itself', async () => {
      const user = userEvent.setup();
      const onToggleExpand = vi.fn();
      renderList('none', ENTRIES, { onToggleExpand });

      await user.click(screen.getByRole('button', { name: /^Nishiki Market/ }));

      expect(onToggleExpand).toHaveBeenCalledWith(2);
      expect(screen.getByRole('button', { name: /^Nishiki Market/ })).toHaveAttribute('aria-expanded', 'false');
    });

    it('marks exactly the row the board names as focused, among several open ones', () => {
      renderList('none', ENTRIES, { expandedIds: new Set([1, 3]), focusedId: 3 });

      const focusedRow = screen.getByRole('button', { name: /^Kinkaku-ji/ }).closest('[data-expanded]');
      const otherRow = screen.getByRole('button', { name: /^Fushimi Inari/ }).closest('[data-expanded]');
      expect(focusedRow).toHaveAttribute('data-focused');
      expect(otherRow).not.toHaveAttribute('data-focused');
    });

    it('marks nothing as focused when the named row is not open', () => {
      renderList('none', ENTRIES, { expandedIds: new Set([1]), focusedId: 2 });

      expect(document.querySelector('[data-focused]')).toBeNull();
    });

    it('hands onFocusRow to the rows, so a press inside an open row reports up', () => {
      const onFocusRow = vi.fn();
      renderList('none', ENTRIES, { expandedIds: new Set([2]), onFocusRow });

      fireEvent.pointerDown(screen.getByRole('button', { name: /^Nishiki Market/ }));

      expect(onFocusRow).toHaveBeenCalledWith(2);
    });

    it('passes a drill straight up with the row it came from', async () => {
      const user = userEvent.setup();
      const onDrill = vi.fn();
      renderList('none', ENTRIES, { insideCounts: new Map([[4, 2]]), onDrill });

      await user.click(screen.getByRole('button', { name: '2 inside ›' }));

      expect(onDrill).toHaveBeenCalledWith(4);
    });
  });

  /**
   * The composer's four props are the same kind of threading, and the list
   * interprets none of them: it hands `composerAt` to every row and lets each
   * one recognise itself, and it hands the three callbacks straight up. The
   * proof is at the rows, because a list that quietly kept the number for
   * itself would look identical from here.
   */
  describe('threading the composer to the rows', () => {
    it('gives the composer to exactly the row the board names, and to no other', () => {
      renderList('none', ENTRIES, { expandedIds: new Set([1, 2]), composerAt: 2 });

      expect(screen.getByText('NEW IDEA INSIDE')).toBeInTheDocument();
      expect(screen.getByText('Nishiki Market', { selector: 'p' })).toBeInTheDocument();
      // One composer on the board means one heading in the list, however many
      // rows are open beside it.
      expect(screen.getAllByText('NEW IDEA INSIDE')).toHaveLength(1);
    });

    it('draws no composer at all when the board names nobody', () => {
      renderList('none', ENTRIES, { expandedIds: new Set([1, 2]) });

      expect(screen.queryByText('NEW IDEA INSIDE')).not.toBeInTheDocument();
    });

    it('carries the composer into grouped modes, where the row sits under a heading', () => {
      renderList('category', ENTRIES, { expandedIds: new Set([3]), composerAt: 3 });

      expect(screen.getByText('NEW IDEA INSIDE')).toBeInTheDocument();
      expect(screen.getByText('Kinkaku-ji', { selector: 'p' })).toBeInTheDocument();
    });

    it('reports "Add an idea inside" up with the row it was pressed on', async () => {
      const user = userEvent.setup();
      const onOpenComposerInside = vi.fn();
      renderList('none', ENTRIES, { expandedIds: new Set([2]), onOpenComposerInside });

      await user.click(screen.getByRole('button', { name: 'Add an idea inside' }));

      expect(onOpenComposerInside).toHaveBeenCalledWith(2);
      // The list decided nothing: no composer appeared until the board said so.
      expect(screen.queryByText('NEW IDEA INSIDE')).not.toBeInTheDocument();
    });

    it('hands the inline composer its cancel, so a dismissal reaches the board', async () => {
      const user = userEvent.setup();
      const onComposerCancel = vi.fn();
      renderList('none', ENTRIES, { expandedIds: new Set([2]), composerAt: 2, onComposerCancel });

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onComposerCancel).toHaveBeenCalled();
    });

    it('hands the inline composer its submit, with the draft untouched', async () => {
      const user = userEvent.setup();
      const onComposerSubmit = vi.fn();
      renderList('none', ENTRIES, { expandedIds: new Set([2]), composerAt: 2, onComposerSubmit });

      await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Pickles to bring home');
      await user.click(screen.getByRole('button', { name: 'Add idea' }));

      expect(onComposerSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Pickles to bring home', parentIds: [2] }),
      );
    });
  });
});
