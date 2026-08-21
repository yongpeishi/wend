import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { TripRoleProvider } from '../../auth/TripRoleContext';
import { FilterBar } from './FilterBar';
import { EMPTY_FILTERS } from './filters';
import type { GroupMode, IdeaFilters } from './filters';

function renderBar(
  overrides: {
    filters?: IdeaFilters;
    groupMode?: GroupMode;
    onChange?: (filters: IdeaFilters) => void;
    onGroupModeChange?: (mode: GroupMode) => void;
    visibleCount?: number;
    totalCount?: number;
    mapOpen?: boolean;
    onToggleMap?: () => void;
    selectMode?: boolean;
    onSelectModeChange?: (selecting: boolean) => void;
  } = {},
) {
  return render(
    <FilterBar
      filters={overrides.filters ?? EMPTY_FILTERS}
      onChange={overrides.onChange ?? (() => {})}
      visibleCount={overrides.visibleCount ?? 8}
      totalCount={overrides.totalCount ?? 12}
      groupMode={overrides.groupMode ?? 'none'}
      onGroupModeChange={overrides.onGroupModeChange ?? (() => {})}
      mapOpen={overrides.mapOpen}
      onToggleMap={overrides.onToggleMap}
      selectMode={overrides.selectMode}
      onSelectModeChange={overrides.onSelectModeChange}
    />,
  );
}

/**
 * FilterBar is controlled, so a spy `onChange` freezes the chips at whatever
 * `filters` was passed in. Multi-select is a sequence — light one, light
 * another, put one out — and asserting on it means letting the state actually
 * move, so these tests drive a tiny stateful host instead of a spy.
 */
function StatefulBar({ initial }: { initial: IdeaFilters }) {
  const [filters, setFilters] = useState<IdeaFilters>(initial);
  return (
    <FilterBar
      filters={filters}
      onChange={setFilters}
      visibleCount={8}
      totalCount={12}
      groupMode="none"
      onGroupModeChange={() => {}}
    />
  );
}

function renderStatefulBar(initial: IdeaFilters = EMPTY_FILTERS) {
  return render(<StatefulBar initial={initial} />);
}

/** The chips live behind the Filter button, so every chip assertion opens it
 * first. The button's accessible name carries the active count, hence the regex. */
async function openFilters(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: /^Filter/ }));
  return screen.getByRole('group', { name: 'Filter ideas' });
}

describe('FilterBar — the filter popover', () => {
  it('keeps the chips out of the way until they are asked for', async () => {
    const user = userEvent.setup();
    renderBar();

    expect(screen.queryByText('What')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Food' })).not.toBeInTheDocument();

    await openFilters(user);

    expect(screen.getByText('What')).toBeInTheDocument();
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument();
  });

  it('tells assistive tech whether the panel is open', async () => {
    const user = userEvent.setup();
    renderBar();
    const trigger = screen.getByRole('button', { name: /^Filter/ });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes again when the button is clicked a second time', async () => {
    const user = userEvent.setup();
    renderBar();

    await openFilters(user);
    await user.click(screen.getByRole('button', { name: /^Filter/ }));

    expect(screen.queryByRole('group', { name: 'Filter ideas' })).not.toBeInTheDocument();
  });

  it('closes when the click lands outside it', async () => {
    const user = userEvent.setup();
    renderBar();
    await openFilters(user);

    await user.click(document.body);

    expect(screen.queryByRole('group', { name: 'Filter ideas' })).not.toBeInTheDocument();
  });

  // Without this a keyboard user who opens the panel has no way to shut it.
  it('Escape closes it and hands focus back to the button', async () => {
    const user = userEvent.setup();
    renderBar();
    await openFilters(user);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('group', { name: 'Filter ideas' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Filter/ })).toHaveFocus();
  });

  it('puts focus on the first chip when it opens, so a keyboard reaches them', async () => {
    const user = userEvent.setup();
    renderBar();
    await openFilters(user);

    expect(screen.getByRole('button', { name: 'Place' })).toHaveFocus();
  });

  // Setting two filters should be one trip through the button, not two.
  it('stays open while chips are being toggled', async () => {
    const user = userEvent.setup();
    renderBar({ onChange: () => {} });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(screen.getByRole('group', { name: 'Filter ideas' })).toBeInTheDocument();
  });
});

// Folding the chips away costs visibility of what is on, so the button carries
// that back out — and not in a coloured badge alone.
describe('FilterBar — the active-filter count', () => {
  it('says nothing when nothing is narrowing the list', () => {
    renderBar({ filters: EMPTY_FILTERS });
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /active/ })).not.toBeInTheDocument();
  });

  it('counts each narrowing separately in the accessible name', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'], hasLocation: true } });
    expect(screen.getByRole('button', { name: 'Filter (2 active)' })).toBeInTheDocument();
  });

  it('counts all three at once', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'], hasLocation: true, scheduleState: 'scheduled' } });
    expect(screen.getByRole('button', { name: 'Filter (3 active)' })).toBeInTheDocument();
  });

  it('shows the number on the badge too', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'] } });
    expect(within(screen.getByRole('button', { name: 'Filter (1 active)' })).getByText('1')).toBeInTheDocument();
  });

  it('counts each selected category individually', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['place', 'food'] } });
    expect(screen.getByRole('button', { name: 'Filter (2 active)' })).toBeInTheDocument();
  });

  // Search text is not part of the badge: it is already visible in the search
  // box, and a count of hidden things must count only what is hidden.
  it('leaves the search text out of the count', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, text: 'ramen' } });
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });
});

describe('FilterBar — the search box', () => {
  it('shows the round search input with its placeholder', () => {
    renderBar();
    const input = screen.getByRole('searchbox', { name: 'Search ideas' });
    expect(input).toHaveAttribute('placeholder', 'Search ideas');
  });

  it('writes what is typed into filters.text', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ onChange });

    await user.type(screen.getByRole('searchbox', { name: 'Search ideas' }), 'r');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: 'r' }));
  });

  it('shows the current text, and clears back to everything', async () => {
    const user = userEvent.setup();
    renderStatefulBar();
    const input = screen.getByRole('searchbox', { name: 'Search ideas' });

    await user.type(input, 'kyoto');
    expect(input).toHaveValue('kyoto');

    await user.clear(input);
    expect(input).toHaveValue('');
  });
});

/**
 * The chips are a set you build up, not a single choice you replace. "Food or
 * places?" is the normal shape of a trip question.
 */
describe('FilterBar — categories are multi-select', () => {
  it('narrows by category', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ onChange });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categories: ['food'] }));
  });

  it('adds a second category instead of replacing the first', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'] }, onChange });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Place' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categories: ['place', 'food'] }));
  });

  it('unsets a category by clicking the chip that is already on', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'] }, onChange });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categories: [] }));
  });

  // aria-pressed per chip is what makes this announce as a set of independent
  // toggles rather than a one-of-many choice.
  it('reports every lit chip as pressed, and the rest as not', async () => {
    const user = userEvent.setup();
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['place', 'food'] } });
    await openFilters(user);

    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Lodging' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('lights two chips at once across a real sequence of clicks', async () => {
    const user = userEvent.setup();
    renderStatefulBar();
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Food' }));
    await user.click(screen.getByRole('button', { name: 'Place' }));

    expect(screen.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Filter/ })).toHaveAccessibleName('Filter (2 active)');
  });
});

// Filters hide, never delete — so every active narrowing is echoed under the
// row as its own removable chip, outside the popover that set it: the way out
// of a narrowing must never be behind the control that caused it.
describe('FilterBar — the active filter chips', () => {
  it('shows nothing below the row while nothing is narrowed', () => {
    renderBar({ filters: EMPTY_FILTERS });
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Filtered, not gone/)).not.toBeInTheDocument();
  });

  it('echoes each lit filter as a removable chip, with the promise alongside', () => {
    renderBar({
      filters: { ...EMPTY_FILTERS, categories: ['place', 'food'], hasLocation: true, scheduleState: 'scheduled' },
    });

    const chips = screen.getByRole('group', { name: 'Active filters' });
    expect(within(chips).getByRole('button', { name: 'Remove Place filter' })).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: 'Remove Food filter' })).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: 'Remove Has location filter' })).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: 'Remove Scheduled filter' })).toBeInTheDocument();
    expect(screen.getByText('Filtered, not gone — clear a chip to widen again.')).toBeInTheDocument();
  });

  it('clicking a chip lifts exactly that narrowing and keeps the rest', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({
      filters: { ...EMPTY_FILTERS, categories: ['place', 'food'], scheduleState: 'scheduled' },
      onChange,
    });

    await user.click(screen.getByRole('button', { name: 'Remove Food filter' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ categories: ['place'], scheduleState: 'scheduled' }),
    );

    await user.click(screen.getByRole('button', { name: 'Remove Scheduled filter' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ categories: ['place', 'food'], scheduleState: 'all' }),
    );
  });

  it('clears down to nothing one chip at a time', async () => {
    const user = userEvent.setup();
    renderStatefulBar({ ...EMPTY_FILTERS, categories: ['place'], hasLocation: true });

    await user.click(screen.getByRole('button', { name: 'Remove Place filter' }));
    await user.click(screen.getByRole('button', { name: 'Remove Has location filter' }));

    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('does not echo the search text as a chip — the box already shows it', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, text: 'ramen' } });
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
  });
});

describe('FilterBar — the way back to the map', () => {
  it('offers "Show map" only while the map is hidden', () => {
    const view = renderBar({ mapOpen: false, onToggleMap: () => {} });
    expect(screen.getByRole('button', { name: 'Show map' })).toBeInTheDocument();
    view.unmount();

    renderBar({ mapOpen: true, onToggleMap: () => {} });
    expect(screen.queryByRole('button', { name: 'Show map' })).not.toBeInTheDocument();
    // And no "Hide map" here either — the pane's own header carries that.
    expect(screen.queryByRole('button', { name: 'Hide map' })).not.toBeInTheDocument();
  });

  it('asks the board to open it', async () => {
    const user = userEvent.setup();
    const onToggleMap = vi.fn();
    renderBar({ mapOpen: false, onToggleMap });

    await user.click(screen.getByRole('button', { name: 'Show map' }));

    expect(onToggleMap).toHaveBeenCalled();
  });

  it('draws no map control at all for a caller with no map', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: 'Show map' })).not.toBeInTheDocument();
  });
});

// The product requirement: grouping and filtering are orthogonal. Whatever the
// group mode, the chips stay available and keep writing to the filter state.
describe('FilterBar — the grouping control', () => {
  it('offers both groupings at once, whichever one is on', () => {
    for (const mode of ['none', 'category'] as const) {
      const view = renderBar({ groupMode: mode });
      const control = screen.getByRole('tablist', { name: 'Group ideas' });
      expect(within(control).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Ungrouped',
        'By category',
      ]);
      view.unmount();
    }
  });

  it('marks the grouping you are in as the selected one', () => {
    renderBar({ groupMode: 'category' });
    expect(screen.getByRole('tab', { name: 'By category' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Ungrouped' })).toHaveAttribute('aria-selected', 'false');
  });

  it.each([
    ['Ungrouped', 'none'],
    ['By category', 'category'],
  ])('switches to %s', async (label, mode) => {
    const user = userEvent.setup();
    const onGroupModeChange = vi.fn();
    // Start somewhere else in every case, so each option is reached rather
    // than merely already selected.
    renderBar({ groupMode: mode === 'none' ? 'category' : 'none', onGroupModeChange });

    await user.click(screen.getByRole('tab', { name: label }));

    expect(onGroupModeChange).toHaveBeenCalledWith(mode);
  });

  it('still moves selection with the arrow keys', async () => {
    const user = userEvent.setup();
    const onGroupModeChange = vi.fn();
    renderBar({ groupMode: 'none', onGroupModeChange });

    screen.getByRole('tab', { name: 'Ungrouped' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(onGroupModeChange).toHaveBeenCalledWith('category');
  });

  it('still narrows by category while the list is grouped', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onGroupModeChange = vi.fn();
    renderBar({ groupMode: 'category', onChange, onGroupModeChange });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categories: ['food'] }));
    expect(onGroupModeChange).not.toHaveBeenCalled();
  });

  it('leaves the active filters alone when the grouping changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'] }, onChange });

    await user.click(screen.getByRole('tab', { name: 'By category' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FilterBar — the count line', () => {
  it('always says how much is on screen', () => {
    renderBar({ visibleCount: 3, totalCount: 12 });
    expect(screen.getByText(/Showing 3 of 12/)).toBeInTheDocument();
  });

  it('and there is no "+ New idea" here any more — capture replaced it', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: /new idea/i })).not.toBeInTheDocument();
  });
});

/**
 * A viewer loses the one control that leads somewhere they cannot go, and
 * keeps every control that only decides what is on screen. Both halves are
 * asserted together on purpose: "the button is gone" is also true of a blank
 * bar.
 */
describe('FilterBar — reading along', () => {
  function renderAsViewer() {
    return render(
      <TripRoleProvider role="viewer">
        <FilterBar
          filters={EMPTY_FILTERS}
          onChange={() => {}}
          visibleCount={8}
          totalCount={12}
          groupMode="none"
          onGroupModeChange={() => {}}
          onSelectModeChange={() => {}}
          onToggleMap={() => {}}
        />
      </TripRoleProvider>,
    );
  }

  it('takes away the way into select mode', () => {
    renderAsViewer();
    expect(screen.queryByRole('button', { name: 'Select several' })).not.toBeInTheDocument();
  });

  it('keeps everything that only narrows the list — search, filters, grouping, the map and the count', async () => {
    const user = userEvent.setup();
    renderAsViewer();

    expect(screen.getByText('Showing 8 of 12')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search ideas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show map' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'By category' })).toBeInTheDocument();

    const panel = await openFilters(user);
    expect(within(panel).getByRole('button', { name: 'Food' })).toBeEnabled();
  });

  it('leaves an owner the select toggle', () => {
    render(
      <TripRoleProvider role="owner">
        <FilterBar
          filters={EMPTY_FILTERS}
          onChange={() => {}}
          visibleCount={8}
          totalCount={12}
          groupMode="none"
          onGroupModeChange={() => {}}
          onSelectModeChange={() => {}}
        />
      </TripRoleProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select several' })).toBeInTheDocument();
  });

  it('flips the select toggle label with the mode', async () => {
    const user = userEvent.setup();
    const onSelectModeChange = vi.fn();
    const view = renderBar({ onSelectModeChange, selectMode: false });
    await user.click(screen.getByRole('button', { name: 'Select several' }));
    expect(onSelectModeChange).toHaveBeenCalledWith(true);
    view.unmount();

    renderBar({ onSelectModeChange, selectMode: true });
    expect(screen.getByRole('button', { name: 'Done selecting' })).toBeInTheDocument();
  });
});
