import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import type { EntrySummary } from '../../api/types';
import { ArchivedPanel } from './ArchivedPanel';
import type { ItineraryDay, PoolEntry } from './itineraryModel';
import { UnplacedRail } from './UnplacedRail';

/** A kept thing no day holds yet — the pool entry `buildPool` makes of a bare summary. */
function summary(id: number, title: string, kind: EntrySummary['kind'] = 'idea'): PoolEntry {
  return { id, kind, title, category: 'place', duration_minutes: 60, placedOn: [], placedMarker: null };
}

/** The same thing, already on the given days, wearing the marker the model would give it. */
function placed(entry: PoolEntry, placedOn: string[], placedMarker: string): PoolEntry {
  return { ...entry, placedOn, placedMarker };
}

function day(number: number, iso: string, label: string): ItineraryDay {
  return {
    day: iso,
    number,
    label,
    tripDay: null,
    versions: [{ id: number, trip_day_id: 1, name: 'Version A', position: 0, archived_at: null, schedule_items: [] }],
    archivedVersions: [],
    lodgingTitle: null,
    lodgingEntryId: null,
    lodgingLabel: null,
  };
}

const DAYS = [day(1, '2026-10-12', 'Day 1 · Mon 12'), day(2, '2026-10-13', 'Day 2 · Tue 13')];
const ITEMS = [summary(1, 'Kinkaku-ji'), summary(2, 'Central wander', 'bundle')];

/** The rail's items are draggables, so it only exists inside a DndContext. */
function renderRail(props: Partial<Parameters<typeof UnplacedRail>[0]> = {}) {
  const onAddToDay = vi.fn();
  render(
    <DndContext>
      <UnplacedRail
        title="Kept for this trip · 2"
        line={props.line ?? 'Drag one onto a day, or use its menu.'}
        items={props.items ?? ITEMS}
        days={props.days ?? DAYS}
        onAddToDay={props.onAddToDay ?? onAddToDay}
        readOnly={props.readOnly}
      >
        {props.children}
      </UnplacedRail>
    </DndContext>,
  );
  return { onAddToDay };
}

describe('UnplacedRail — what is waiting', () => {
  it('counts what is waiting and says how to place it', () => {
    renderRail();

    expect(screen.getByText('Kept for this trip · 2')).toBeInTheDocument();
    expect(screen.getByText('Drag one onto a day, or use its menu.')).toBeInTheDocument();
  });

  it('names each thing and what it is', () => {
    renderRail();

    expect(screen.getByText('Kinkaku-ji')).toBeInTheDocument();
    expect(screen.getByText('Plan · 1 hr')).toBeInTheDocument();
  });

  it('says plainly when nothing has been kept for the trip yet', () => {
    renderRail({ items: [] });

    expect(
      screen.getByText('Nothing kept for this trip yet. Keep something on the Ideas board and it waits here.'),
    ).toBeInTheDocument();
  });

  // Feedback #26: a thing placed on Day 1 vanished from the rail, so it could
  // never be placed on Day 2. It stays now, and says where it already is.
  it('marks a thing that is already on a day, and leaves the others unmarked', () => {
    renderRail({
      items: [summary(1, 'Kinkaku-ji'), placed(summary(2, 'Central wander', 'bundle'), ['2026-10-12'], 'placed · Day 1')],
    });

    expect(screen.getByText('placed · Day 1')).toBeInTheDocument();
    const placedRow = screen.getByText('Central wander').closest('[data-placed]');
    expect(placedRow).not.toBeNull();
    expect(placedRow).toHaveTextContent('placed · Day 1');

    expect(screen.getByText('Kinkaku-ji').closest('[data-placed]')).toBeNull();
    expect(screen.getAllByText(/^placed · /)).toHaveLength(1);
  });

  it('says out loud that nothing here is used up', () => {
    renderRail();

    expect(screen.getByText(/Nothing here is used up/)).toBeInTheDocument();
  });

  it('gives the archived panel a home at its foot', () => {
    renderRail({
      children: (
        <ArchivedPanel
          archived={[
            {
              version: {
                id: 9,
                trip_day_id: 1,
                name: 'Version B',
                position: 1,
                archived_at: 'now',
                schedule_items: [],
              },
              label: 'Day 4 · Wed 15 · Version B',
            },
          ]}
          open={false}
          onToggle={() => {}}
          onRestore={() => {}}
        />
      ),
    });

    expect(screen.getByRole('button', { name: /Archived · 1/ })).toBeInTheDocument();
  });
});

describe('UnplacedRail — getting something onto a day', () => {
  it('offers a drag handle, labelled so it is findable', () => {
    renderRail();

    expect(screen.getByRole('button', { name: 'Drag Kinkaku-ji onto a day' })).toBeInTheDocument();
  });

  // Dragging is the accelerator. This is the route that must work on its own.
  it('places a thing on a day from the menu, with no dragging at all', async () => {
    const user = userEvent.setup();
    const { onAddToDay } = renderRail();

    await user.click(screen.getByRole('button', { name: 'Add Kinkaku-ji to a day' }));
    await user.click(screen.getByRole('button', { name: 'Add to Day 2 · Tue 13' }));

    expect(onAddToDay).toHaveBeenCalledWith(1, '2026-10-13');
  });

  it('keeps the days out of the way until the menu is asked for', () => {
    renderRail();

    expect(screen.queryByRole('button', { name: 'Add to Day 1 · Mon 12' })).not.toBeInTheDocument();
  });

  it('opens the menu onto its first day, so a keyboard lands inside it', async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(screen.getByRole('button', { name: 'Add Kinkaku-ji to a day' }));

    expect(screen.getByRole('button', { name: 'Add to Day 1 · Mon 12' })).toHaveFocus();
  });

  // The menu is the keyboard's whole equivalent of dragging something onto a
  // day, and a fourteen-day trip makes it a long list. Tab still walks it.
  it('walks the days with the arrow keys, wrapping round both ends', async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(screen.getByRole('button', { name: 'Add Kinkaku-ji to a day' }));
    const first = screen.getByRole('button', { name: 'Add to Day 1 · Mon 12' });
    const last = screen.getByRole('button', { name: 'Add to Day 2 · Tue 13' });

    await user.keyboard('{ArrowDown}');
    expect(last).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(first).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(last).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
  });

  it('jumps to the first and the last day with Home and End', async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(screen.getByRole('button', { name: 'Add Kinkaku-ji to a day' }));

    await user.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Add to Day 2 · Tue 13' })).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByRole('button', { name: 'Add to Day 1 · Mon 12' })).toHaveFocus();
  });

  it('still places the day the arrows landed on', async () => {
    const user = userEvent.setup();
    const { onAddToDay } = renderRail();

    await user.click(screen.getByRole('button', { name: 'Add Kinkaku-ji to a day' }));
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onAddToDay).toHaveBeenCalledWith(1, '2026-10-13');
  });

  // Tab was the only way through the list before the arrows arrived, and
  // people who learned it must not lose it.
  it('keeps Tab walking the days as it always did', async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(screen.getByRole('button', { name: 'Add Kinkaku-ji to a day' }));
    await user.tab();

    expect(screen.getByRole('button', { name: 'Add to Day 2 · Tue 13' })).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the button that opened it', async () => {
    const user = userEvent.setup();
    renderRail();
    const trigger = screen.getByRole('button', { name: 'Add Kinkaku-ji to a day' });

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: 'Add to Day 1 · Mon 12' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes when you click away from it', async () => {
    const user = userEvent.setup();
    renderRail();

    await user.click(screen.getByRole('button', { name: 'Add Kinkaku-ji to a day' }));
    await user.click(document.body);

    expect(screen.queryByRole('button', { name: 'Add to Day 1 · Mon 12' })).not.toBeInTheDocument();
  });

  // The whole point of keeping a placed thing in the rail: it can go on
  // another day too, by either route. Placed is a fact, not a lock.
  it('still drags and still offers the menu for a thing already on a day', async () => {
    const user = userEvent.setup();
    const { onAddToDay } = renderRail({
      items: [placed(summary(1, 'Kinkaku-ji'), ['2026-10-12'], 'placed · Day 1')],
    });

    expect(screen.getByRole('button', { name: 'Drag Kinkaku-ji onto a day' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Kinkaku-ji to a day' }));
    await user.click(screen.getByRole('button', { name: 'Add to Day 2 · Tue 13' }));

    expect(onAddToDay).toHaveBeenCalledWith(1, '2026-10-13');
  });

  it('says why the menu is empty when the trip has no dates yet', async () => {
    const user = userEvent.setup();
    renderRail({ days: [] });

    await user.click(screen.getByRole('button', { name: 'Add Kinkaku-ji to a day' }));

    expect(screen.getByText(/Set the trip's dates and the days appear here/)).toBeInTheDocument();
  });
});

describe('UnplacedRail — read only', () => {
  it('keeps the whole list, and both ways onto a day off it', () => {
    // The line is the caller's to match: the editable sentence names a grip and
    // a ⋯ menu, and a viewer has neither. See TripItinerary's RAIL_LINE.
    renderRail({ readOnly: true, line: 'Kept for this trip, not on a day yet.' });

    expect(screen.getByText('Kept for this trip · 2')).toBeInTheDocument();
    expect(screen.getByText('Kept for this trip, not on a day yet.')).toBeInTheDocument();
    expect(screen.getByText('Kinkaku-ji')).toBeInTheDocument();
    expect(screen.getByText('Plan · 1 hr')).toBeInTheDocument();
    // The one thing about this rail people assume wrongly still gets said.
    expect(screen.getByText(/Nothing here is used up/)).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add .* to a day$/ })).not.toBeInTheDocument();
    // Nothing left on the rail to press at all.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('still says plainly when nothing has been kept for the trip yet', () => {
    renderRail({ readOnly: true, items: [] });

    expect(screen.getByText(/Nothing kept for this trip yet/)).toBeInTheDocument();
  });

  // A viewer sees where things already are — that is reading — with no way to
  // put them anywhere else.
  it('keeps the placed marker for a viewer, with nothing to press beside it', () => {
    renderRail({
      readOnly: true,
      items: [placed(summary(1, 'Kinkaku-ji'), ['2026-10-12'], 'placed · Day 1')],
    });

    expect(screen.getByText('placed · Day 1')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
