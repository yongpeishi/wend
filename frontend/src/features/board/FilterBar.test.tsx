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

/** The chips live behind the Filter button now, so every chip assertion opens it
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

  // Without this a keyboard user who opens the panel has no way to shut it: the
  // design only ever specified the outside-click catcher.
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

// Folding the chips away costs visibility of what is on, so the button has to
// carry that back out — and not in a coloured badge alone.
describe('FilterBar — the active-filter count', () => {
  it('says nothing when nothing is narrowing the list', () => {
    renderBar({ filters: EMPTY_FILTERS });
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /active/ })).not.toBeInTheDocument();
  });

  it('counts each narrowing separately in the accessible name', () => {
    renderBar({ filters: { categories: ['food'], hasLocation: true, scheduleState: 'all' } });
    expect(screen.getByRole('button', { name: 'Filter (2 active)' })).toBeInTheDocument();
  });

  it('counts all three at once', () => {
    renderBar({ filters: { categories: ['food'], hasLocation: true, scheduleState: 'scheduled' } });
    expect(screen.getByRole('button', { name: 'Filter (3 active)' })).toBeInTheDocument();
  });

  it('shows the number on the badge too', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'] } });
    expect(within(screen.getByRole('button', { name: 'Filter (1 active)' })).getByText('1')).toBeInTheDocument();
  });

  // Each lit chip counts on its own, so lighting a second category moves the
  // badge. Counting the category section as one narrowing would let the second
  // chip hide behind a number that never changed.
  it('counts each selected category individually', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['place', 'food'] } });
    expect(screen.getByRole('button', { name: 'Filter (2 active)' })).toBeInTheDocument();
  });

  it('adds up categories alongside the state narrowings', () => {
    renderBar({ filters: { categories: ['place', 'food', 'lodging'], hasLocation: true, scheduleState: 'scheduled' } });
    expect(screen.getByRole('button', { name: 'Filter (5 active)' })).toBeInTheDocument();
  });

  it('goes quiet again when the categories are cleared', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, categories: [] } });
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });
});

describe('FilterBar — category filtering', () => {
  it('labels the category chips', async () => {
    const user = userEvent.setup();
    renderBar();
    await openFilters(user);
    expect(screen.getByText('What')).toBeInTheDocument();
  });

  it('narrows by category', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ onChange });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categories: ['food'] }));
  });

  it('unsets a category by clicking the chip that is already on', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'] }, onChange });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categories: [] }));
  });
});

/**
 * The chips are a set you build up, not a single choice you replace. "Food or
 * places?" is the normal shape of a trip question, and answering it used to
 * mean flipping between two lists because selecting the second category threw
 * the first away.
 */
describe('FilterBar — categories are multi-select', () => {
  it('adds a second category instead of replacing the first', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'] }, onChange });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Place' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categories: ['place', 'food'] }));
  });

  it('keeps the others when one of several is switched off', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['place', 'food', 'lodging'] }, onChange });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categories: ['place', 'lodging'] }));
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

  it('leaves the other one lit after deselecting one of the pair', async () => {
    const user = userEvent.setup();
    renderStatefulBar({ ...EMPTY_FILTERS, categories: ['place', 'food'] });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(screen.getByRole('button', { name: 'Food' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Place' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Filter/ })).toHaveAccessibleName('Filter (1 active)');
  });

  // Unpicking four lit chips by hand is four clicks through a panel you have to
  // open first, so the one-move way out has to clear all of them.
  it('clears every lit category at once from "See all"', async () => {
    const user = userEvent.setup();
    renderStatefulBar({ categories: ['place', 'food', 'lodging'], hasLocation: true, scheduleState: 'scheduled' });

    await user.click(screen.getByRole('button', { name: 'See all' }));

    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();

    await openFilters(user);
    for (const label of ['Place', 'Food', 'Lodging']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    }
  });
});

// The product requirement: grouping and filtering are orthogonal. Whatever the
// group mode, the chips stay available and keep writing to the filter state —
// the segmented control never touches `filters`, and a chip never touches the
// group mode.
describe('FilterBar — filtering keeps working while grouped', () => {
  it.each(['none', 'category', 'location'] as const)('offers every category chip in %s mode', async (groupMode) => {
    const user = userEvent.setup();
    renderBar({ groupMode });
    await openFilters(user);
    for (const label of ['Place', 'Food', 'Activity', 'Lodging', 'Transport', 'Other']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('still narrows by category while grouped by place', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onGroupModeChange = vi.fn();
    renderBar({ groupMode: 'location', onChange, onGroupModeChange });
    await openFilters(user);

    await user.click(screen.getByRole('button', { name: 'Food' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ categories: ['food'] }));
    expect(onGroupModeChange).not.toHaveBeenCalled();
  });

  it('leaves the active filters alone when the grouping changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'] }, onChange });

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

  // The compact variant is a skin, not a different control: the roving-tabindex
  // contract has to survive it, because arrow keys are how this is reached
  // without a mouse.
  it('still moves selection with the arrow keys', async () => {
    const user = userEvent.setup();
    const onGroupModeChange = vi.fn();
    renderBar({ groupMode: 'none', onGroupModeChange });

    screen.getByRole('tab', { name: 'Ungrouped' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(onGroupModeChange).toHaveBeenCalledWith('location');
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

// Filters hide, never delete — so the count is always on screen, and the way
// out is there for as long as there is something to escape from. Both stay
// outside the popover: the way back must never be behind the control that
// narrowed the list.
describe('FilterBar — the escape hatch', () => {
  it('always shows how much is hidden', () => {
    renderBar({ visibleCount: 3, totalCount: 12 });
    expect(screen.getByText(/Showing 3 of 12/)).toBeInTheDocument();
  });

  it('offers the way out whenever a filter is narrowing the list', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'] }, visibleCount: 3, totalCount: 12 });
    expect(screen.getByRole('button', { name: 'See all' })).toBeEnabled();
  });

  it('offers it without the popover having to be open', () => {
    renderBar({ filters: { ...EMPTY_FILTERS, categories: ['food'] }, visibleCount: 3, totalCount: 12 });
    expect(screen.queryByRole('group', { name: 'Filter ideas' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });

  it('clears every narrowing at once', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderBar({ filters: { categories: ['food'], hasLocation: true, scheduleState: 'scheduled' }, onChange });

    await user.click(screen.getByRole('button', { name: 'See all' }));

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });

  // The feedback: with the whole list on screen there is nothing to widen back
  // to, so the control goes away rather than sitting there greyed out.
  it('hides the way out entirely when every idea is already listed', () => {
    renderBar({ filters: EMPTY_FILTERS, visibleCount: 12, totalCount: 12 });
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 12 of 12/)).toBeInTheDocument();
  });

  it('does not treat the grouping as a narrowing to escape from', () => {
    renderBar({ filters: EMPTY_FILTERS, groupMode: 'location' });
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
  });
});

describe('FilterBar — the new idea button', () => {
  it('sits on the control row when the board wires it up', async () => {
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

/**
 * A viewer loses the two controls that lead somewhere they cannot go, and keeps
 * every control that only decides what is on screen. Both halves are asserted
 * together on purpose: "the buttons are gone" is also true of a blank bar.
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
          onNewIdea={() => {}}
          onSelectModeChange={() => {}}
          onToggleMap={() => {}}
        />
      </TripRoleProvider>,
    );
  }

  it('takes away "+ New idea" and the way into select mode', () => {
    renderAsViewer();

    expect(screen.queryByRole('button', { name: '+ New idea' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
  });

  it('keeps everything that only narrows the list — filters, grouping, the map and the count', async () => {
    const user = userEvent.setup();
    renderAsViewer();

    expect(screen.getByText('Showing 8 of 12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show map' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'By location' })).toBeInTheDocument();

    const panel = await openFilters(user);
    expect(within(panel).getByRole('button', { name: 'Food' })).toBeEnabled();
  });

  it('leaves an owner both of them', () => {
    render(
      <TripRoleProvider role="owner">
        <FilterBar
          filters={EMPTY_FILTERS}
          onChange={() => {}}
          visibleCount={8}
          totalCount={12}
          groupMode="none"
          onGroupModeChange={() => {}}
          onNewIdea={() => {}}
          onSelectModeChange={() => {}}
        />
      </TripRoleProvider>,
    );

    expect(screen.getByRole('button', { name: '+ New idea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
  });
});
