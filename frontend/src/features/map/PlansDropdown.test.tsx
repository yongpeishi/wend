import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Entry } from '../../api/types';
import { PlansDropdown } from './PlansDropdown';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'idea',
    title: 'Untitled',
    description: null,
    category: null,
    starts_on: null,
    ends_on: null,
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

const TUESDAY = makeEntry({ id: 90, kind: 'bundle', title: 'Tuesday south' });
const TRAVEL_DAY = makeEntry({ id: 91, kind: 'bundle', title: 'Travel day' });

function renderDropdown({
  bundles = [TUESDAY, TRAVEL_DAY],
  members = new Map<number, Entry[]>(),
  selectedId = null,
}: { bundles?: Entry[]; members?: Map<number, Entry[]>; selectedId?: number | null } = {}) {
  const onSelect = vi.fn();
  render(<PlansDropdown bundles={bundles} members={members} selectedId={selectedId} onSelect={onSelect} />);
  return { onSelect };
}

/**
 * The open panel, scoped. Once a plan is picked the TRIGGER reads its title
 * too, so a bare getByRole for a plan name would find two buttons — the row and
 * the control that says which row is current. The panel names itself "Plans"
 * via its label, which is what this reaches for.
 */
function panel() {
  return within(screen.getByRole('group', { name: 'Plans' }));
}

describe('PlansDropdown', () => {
  it('names itself and carries the count on the trigger', () => {
    renderDropdown();
    const trigger = screen.getByRole('button', { name: 'Plans 2' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays shut until it is asked for', () => {
    renderDropdown();
    expect(screen.queryByText('Tuesday south')).not.toBeInTheDocument();
  });

  it('lists each plan with how many ideas it holds, as a row you can pick', async () => {
    const user = userEvent.setup();
    renderDropdown({
      members: new Map([
        [90, [makeEntry({ id: 5 }), makeEntry({ id: 6 })]],
        [91, [makeEntry({ id: 7 })]],
      ]),
    });

    await user.click(screen.getByRole('button', { name: 'Plans 2' }));

    expect(screen.getByRole('button', { name: 'Plans 2' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('2 ideas')).toBeInTheDocument();
    expect(screen.getByText('1 idea')).toBeInTheDocument();
    // Every row is a real button now — picking one narrows the map to that
    // plan, which is a way of reading it, not a way of editing it.
    expect(screen.getByRole('button', { name: /Tuesday south/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Travel day/ })).toBeInTheDocument();
    // Opening hands the keyboard the first row rather than stranding it on the
    // trigger, now that there is something inside to operate.
    expect(screen.getByRole('button', { name: 'All plans' })).toHaveFocus();
  });

  it('picking a plan reports it and shuts the panel', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Plans 2' }));
    await user.click(screen.getByRole('button', { name: /Tuesday south/ }));

    expect(onSelect).toHaveBeenCalledWith(90);
    expect(screen.queryByRole('button', { name: 'All plans' })).not.toBeInTheDocument();
  });

  it('marks the picked plan in words and in a glyph, not only in colour', async () => {
    const user = userEvent.setup();
    renderDropdown({ selectedId: 90 });

    await user.click(screen.getByRole('button', { name: /Plans/ }));

    expect(panel().getByRole('button', { name: /Tuesday south/ })).toHaveAttribute('aria-current', 'true');
    expect(panel().getByRole('button', { name: /Travel day/ })).not.toHaveAttribute('aria-current');
    expect(panel().getByRole('button', { name: 'All plans' })).not.toHaveAttribute('aria-current');
    // The tick rides with the row, so the state survives having no colour vision.
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('the trigger reads the picked plan instead of the count', async () => {
    renderDropdown({ selectedId: 91 });

    // Still says what it is — the title is the value, not a replacement name.
    expect(screen.getByRole('button', { name: 'Plans Travel day' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plans 2' })).not.toBeInTheDocument();
  });

  it('picking the plan you are already on widens back to all of them', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown({ selectedId: 90 });

    await user.click(screen.getByRole('button', { name: /Plans/ }));
    await user.click(panel().getByRole('button', { name: /Tuesday south/ }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('"All plans" is the named way out, and is current while nothing is picked', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown({ selectedId: 90 });

    await user.click(screen.getByRole('button', { name: /Plans/ }));
    const allPlans = panel().getByRole('button', { name: 'All plans' });
    expect(allPlans).not.toHaveAttribute('aria-current');
    await user.click(allPlans);

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('counts a plan with nothing in it as 0 ideas', async () => {
    const user = userEvent.setup();
    renderDropdown({ bundles: [TUESDAY] });

    await user.click(screen.getByRole('button', { name: 'Plans 1' }));

    expect(screen.getByText('0 ideas')).toBeInTheDocument();
  });

  it('points an empty trip at where plans start', async () => {
    const user = userEvent.setup();
    renderDropdown({ bundles: [] });

    await user.click(screen.getByRole('button', { name: 'Plans 0' }));

    expect(screen.getByText('No plans yet. Select ideas below to start one.')).toBeInTheDocument();
  });

  it('closes on Escape and gives focus back to the trigger', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Plans 2' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByText('Tuesday south')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plans 2' })).toHaveFocus();
  });

  // The click-catcher is hidden from assistive tech on purpose — a pointer
  // convenience; Escape is the keyboard's way out — so it is reached by its
  // markup rather than by role.
  it('closes when the click lands anywhere else', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByRole('button', { name: 'Plans 2' }));
    const catcher = document.querySelector('button[aria-hidden="true"]');
    expect(catcher).not.toBeNull();
    await user.click(catcher as HTMLElement);

    expect(screen.queryByText('Tuesday south')).not.toBeInTheDocument();
  });
});
