import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('leaves the active filters alone when the grouping is toggled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { ...EMPTY_FILTERS, category: 'food' }, onChange });

    await user.click(screen.getByRole('button', { name: 'Group by place' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('FilterBar — the group toggle', () => {
  it('turns grouping on and reads back as the state it is now in', async () => {
    const user = userEvent.setup();
    const onGroupModeChange = vi.fn();
    renderBar({ groupMode: 'none', onGroupModeChange });

    const toggle = screen.getByRole('button', { name: 'Group by place' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);

    expect(onGroupModeChange).toHaveBeenCalledWith('location');
  });

  it('turns grouping off again, back to a flat list', async () => {
    const user = userEvent.setup();
    const onGroupModeChange = vi.fn();
    renderBar({ groupMode: 'location', onGroupModeChange });

    const toggle = screen.getByRole('button', { name: 'Grouped by place' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);

    expect(onGroupModeChange).toHaveBeenCalledWith('none');
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
