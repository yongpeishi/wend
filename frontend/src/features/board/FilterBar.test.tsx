import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBar } from './FilterBar';
import { EMPTY_FILTERS } from './filters';
import type { GroupMode, IdeaFilters } from './filters';

function renderBar(
  overrides: {
    filters?: IdeaFilters;
    groupMode?: GroupMode;
    onChange?: (filters: IdeaFilters) => void;
    onGroupModeChange?: (mode: GroupMode) => void;
    onNewIdea?: () => void;
    visibleCount?: number;
    totalCount?: number;
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
      onNewIdea={overrides.onNewIdea}
    />,
  );
}

describe('FilterBar — category filtering', () => {
  it('labels the category chips', () => {
    renderBar();
    expect(screen.getByText('What')).toBeInTheDocument();
  });

  it('narrows by category', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ onChange });

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ category: 'food' }));
  });

  it('unsets a category by clicking the chip that is already on', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { ...EMPTY_FILTERS, category: 'food' }, onChange });

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ category: null }));
  });
});

// The product requirement: grouping and filtering are orthogonal. Whatever the
// group mode, the chips stay present and keep writing to the filter state — the
// toggle never touches `filters`, and a chip never touches the group mode.
describe('FilterBar — filtering keeps working while grouped', () => {
  it.each(['none', 'category', 'location'] as const)('offers every category chip in %s mode', (groupMode) => {
    renderBar({ groupMode });
    for (const label of ['Place', 'Food', 'Activity', 'Lodging', 'Transport', 'Other']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('still narrows by category while grouped by place', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onGroupModeChange = vi.fn();
    renderBar({ groupMode: 'location', onChange, onGroupModeChange });

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ category: 'food' }));
    expect(onGroupModeChange).not.toHaveBeenCalled();
  });

  it('leaves the active filters alone when the grouping changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { ...EMPTY_FILTERS, category: 'food' }, onChange });

    await user.click(screen.getByRole('tab', { name: 'By location' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

// The point of the segmented control: no grouping is a dead end. Grouping by
// place used to be a toggle whose only way out was a flat list, which left
// "by category" unreachable from there.
describe('FilterBar — the grouping control', () => {
  it('offers all three groupings at once, whichever one is on', () => {
    for (const mode of ['none', 'location', 'category'] as const) {
      const view = renderBar({ groupMode: mode });
      const control = screen.getByRole('tablist', { name: 'Group ideas' });
      expect(within(control).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Ungrouped',
        'By location',
        'By category',
      ]);
      view.unmount();
    }
  });

  it('marks the grouping you are in as the selected one', () => {
    renderBar({ groupMode: 'location' });
    expect(screen.getByRole('tab', { name: 'By location' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Ungrouped' })).toHaveAttribute('aria-selected', 'false');
  });

  it.each([
    ['Ungrouped', 'none'],
    ['By location', 'location'],
    ['By category', 'category'],
  ])('switches to %s', async (label, mode) => {
    const user = userEvent.setup();
    const onGroupModeChange = vi.fn();
    // Start somewhere else in every case, so each option is reached rather
    // than merely already selected.
    renderBar({ groupMode: mode === 'category' ? 'location' : 'category', onGroupModeChange });

    await user.click(screen.getByRole('tab', { name: label }));

    expect(onGroupModeChange).toHaveBeenCalledWith(mode);
  });

  // The dead end the feedback named: grouped by place, with no way back to
  // categories short of going flat first.
  it('goes straight from grouping by place to grouping by category', async () => {
    const user = userEvent.setup();
    const onGroupModeChange = vi.fn();
    renderBar({ groupMode: 'location', onGroupModeChange });

    await user.click(screen.getByRole('tab', { name: 'By category' }));

    expect(onGroupModeChange).toHaveBeenCalledWith('category');
  });
});

// Filters hide, never delete — so the count and its way out are always on
// screen, narrowed or not.
describe('FilterBar — the escape hatch', () => {
  it('always shows how much is hidden', () => {
    renderBar({ visibleCount: 3, totalCount: 12 });
    expect(screen.getByText(/Showing 3 of 12/)).toBeInTheDocument();
  });

  it('clears every narrowing at once', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { category: 'food', hasLocation: true, scheduleState: 'scheduled' }, onChange });

    await user.click(screen.getByRole('button', { name: 'widen again' }));

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  it('offers nothing to widen when nothing is narrowed', () => {
    renderBar({ filters: EMPTY_FILTERS });
    expect(screen.getByRole('button', { name: 'widen again' })).toBeDisabled();
  });

  it('does not treat the grouping as a narrowing to escape from', () => {
    renderBar({ filters: EMPTY_FILTERS, groupMode: 'location' });
    expect(screen.getByRole('button', { name: 'widen again' })).toBeDisabled();
  });
});

describe('FilterBar — the new idea button', () => {
  it('sits beside the count when the board wires it up', async () => {
    const user = userEvent.setup();
    const onNewIdea = vi.fn();
    renderBar({ onNewIdea });

    await user.click(screen.getByRole('button', { name: '+ New idea' }));

    expect(onNewIdea).toHaveBeenCalled();
  });

  it('is left out entirely when the board keeps that button itself', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: '+ New idea' })).not.toBeInTheDocument();
  });
});
