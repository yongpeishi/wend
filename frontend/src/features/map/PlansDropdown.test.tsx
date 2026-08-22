import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
}: { bundles?: Entry[]; members?: Map<number, Entry[]> } = {}) {
  render(<PlansDropdown bundles={bundles} members={members} />);
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

  it('lists each plan with how many ideas it holds — as words, not buttons', async () => {
    const user = userEvent.setup();
    renderDropdown({
      members: new Map([
        [90, [makeEntry({ id: 5 }), makeEntry({ id: 6 })]],
        [91, [makeEntry({ id: 7 })]],
      ]),
    });

    await user.click(screen.getByRole('button', { name: 'Plans 2' }));

    expect(screen.getByRole('button', { name: 'Plans 2' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Tuesday south')).toBeInTheDocument();
    expect(screen.getByText('2 ideas')).toBeInTheDocument();
    expect(screen.getByText('Travel day')).toBeInTheDocument();
    expect(screen.getByText('1 idea')).toBeInTheDocument();
    // Read-only: the rows offer nothing to press — adding lives on the
    // selection bar, and this dropdown only reports.
    expect(screen.queryByRole('button', { name: /Tuesday south/ })).not.toBeInTheDocument();
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
