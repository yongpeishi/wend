import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import type { DayVersion, ItineraryItem } from '../../api/types';
import { DayRow } from './DayRow';
import type { ItineraryDay } from './itineraryModel';

function item(id: number, title: string, start: number, end: number): ItineraryItem {
  return {
    id,
    trip_id: 1,
    entry_id: id,
    chosen_entry_id: null,
    day: '2026-10-13',
    day_version_id: 1,
    starts_at_minutes: start,
    ends_at_minutes: end,
    note: null,
    position: 0,
    entry: { id, kind: 'idea', title, category: 'place', duration_minutes: null},
    members: [],
  };
}

function version(id: number, name: string, items: ItineraryItem[]): DayVersion {
  return { id, trip_day_id: 1, name, position: 0, archived_at: null, schedule_items: items };
}

function day(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    day: '2026-10-13',
    number: 2,
    label: 'Day 2 · Tue 13',
    tripDay: null,
    versions: [version(1, 'Version A', [item(1, 'Fushimi Inari', 8 * 60, 10 * 60 + 30)])],
    archivedVersions: [],
    lodgingTitle: null,
    lodgingEntryId: null,
    lodgingLabel: null,
    ...overrides,
  };
}

/** DayRow is a drop target, so it only exists inside a DndContext. */
function renderRow(props: Partial<Parameters<typeof DayRow>[0]> = {}) {
  const onToggle = vi.fn();
  render(
    <DndContext>
      <DayRow
        day={props.day ?? day()}
        isDropTarget={props.isDropTarget}
        swapChoices={props.swapChoices}
        onSwapDay={props.onSwapDay}
        onToggle={props.onToggle ?? onToggle}
        readOnly={props.readOnly}
      />
    </DndContext>,
  );
  return { onToggle };
}

/** The row itself — the drop target and the card, around the toggle button. */
function row(): HTMLElement {
  return document.querySelector('[data-drop-id]') as HTMLElement;
}

const TRIP_DAYS = [
  { day: '2026-10-12', label: 'Day 1 · Mon 12' },
  { day: '2026-10-13', label: 'Day 2 · Tue 13' },
  { day: '2026-10-14', label: 'Day 3 · Wed 14' },
];

describe('DayRow — what a closed day says about itself', () => {
  it('names the day and lists what is on it', () => {
    renderRow();

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent('Day 2 · Tue 13');
    expect(row).toHaveTextContent('Fushimi Inari');
  });

  it('adds up the hours that are spoken for', () => {
    renderRow({
      day: day({
        versions: [
          version(1, 'Version A', [
            item(1, 'Fushimi Inari', 8 * 60, 10 * 60),
            item(2, 'Nishiki Market', 13 * 60, 14 * 60),
          ]),
        ],
      }),
    });

    expect(screen.getByText('3 hr')).toBeInTheDocument();
  });

  it('says an empty day is empty, rather than pretending it is a problem', () => {
    renderRow({ day: day({ versions: [version(1, 'Version A', [])] }) });

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('shows where you sleep, without making it a control', () => {
    renderRow({ day: day({ lodgingTitle: 'Machiya near Yasaka' }) });

    expect(screen.getByText('Machiya near Yasaka')).toBeInTheDocument();
    // The whole row is the toggle, so buttons cannot nest inside it.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('says in words when a day is split, not in colour alone', () => {
    renderRow({
      day: day({
        versions: [version(1, 'Version A', []), version(2, 'Version B', [])],
      }),
    });

    expect(screen.getByText('2 versions · not settled')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2 ways to spend it, not settled' })).toBeInTheDocument();
  });

  it('reads its state to assistive tech, since the dot is only a dot', () => {
    renderRow();
    expect(screen.getByRole('img', { name: 'Planned' })).toBeInTheDocument();
  });

  it('calls an empty day waiting rather than decided', () => {
    renderRow({ day: day({ versions: [version(1, 'Version A', [])] }) });

    expect(screen.getByRole('img', { name: 'Nothing planned yet' })).toBeInTheDocument();
  });
});

describe('DayRow — opening it', () => {
  it('opens on a click anywhere in the row', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderRow();

    await user.click(screen.getByRole('button'));

    expect(onToggle).toHaveBeenCalled();
  });

  it('says it is closed, so a keyboard knows what the row does', () => {
    renderRow();

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('DayRow — as a drop target', () => {
  it('marks itself when the container says the drag is over it', () => {
    renderRow({ isDropTarget: true });

    expect(row()).toHaveAttribute('data-drop-target', 'true');
  });

  it('is unmarked the rest of the time', () => {
    renderRow();

    expect(row()).not.toHaveAttribute('data-drop-target');
  });

  // The only handle anything outside React — a browser check aiming a drag, a
  // test laying out geometry — has on a target. The open day and the version
  // columns have carried it since S7; the collapsed row was the gap.
  it('names itself in the DOM, the way every other drop target does', () => {
    renderRow();

    expect(row()).toHaveAttribute('data-drop-id', 'itinerary-day-2026-10-13');
  });
});

describe('DayRow — swapping it with another day', () => {
  it('offers no swap at all when the container has not wired one', () => {
    renderRow({ swapChoices: TRIP_DAYS });

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Swap/ })).not.toBeInTheDocument();
  });

  it('offers every other day of the trip, and never this one', async () => {
    const user = userEvent.setup();
    renderRow({ swapChoices: TRIP_DAYS, onSwapDay: vi.fn() });

    await user.click(screen.getByRole('button', { name: 'Swap Day 2 · Tue 13 with another day' }));

    expect(screen.getByRole('button', { name: 'Swap with Day 1 · Mon 12' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Swap with Day 3 · Wed 14' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Swap with Day 2 · Tue 13' })).not.toBeInTheDocument();
  });

  it('names the day it is exchanging with, and leaves the swap to the container', async () => {
    const user = userEvent.setup();
    const onSwapDay = vi.fn();
    renderRow({ swapChoices: TRIP_DAYS, onSwapDay });

    await user.click(screen.getByRole('button', { name: 'Swap Day 2 · Tue 13 with another day' }));
    await user.click(screen.getByRole('button', { name: 'Swap with Day 3 · Wed 14' }));

    expect(onSwapDay).toHaveBeenCalledWith('2026-10-14');
  });

  // A button cannot live inside a button, so the row is a toggle inside a
  // wrapper rather than being the toggle itself. Opening the day must still be
  // a click on the row, and the swap trigger must not open it.
  it('keeps opening the day a click on the row, with the swap beside it', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderRow({ swapChoices: TRIP_DAYS, onSwapDay: vi.fn() });

    await user.click(screen.getByText('Day 2 · Tue 13'));
    expect(onToggle).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Swap Day 2 · Tue 13 with another day' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // Both states have to lay these two out in the same order, or the trigger
  // you just pressed slides out from under the pointer as the day opens. Here
  // the order is forced: the chevron is a column of the toggle button and the
  // swap cannot go inside a button, so the swap is outboard. DayCard.test.tsx
  // pins the open day to match. jsdom lays nothing out — this is DOM order,
  // not pixels.
  // A closed row is already only a summary and a way to open it, so read-only
  // takes exactly one thing off it — and leaves everything the row says.
  it('takes the swap away for a viewer, and nothing else', async () => {
    const user = userEvent.setup();
    const { onToggle } = renderRow({
      readOnly: true,
      swapChoices: TRIP_DAYS,
      onSwapDay: vi.fn(),
      day: day({ lodgingTitle: 'Machiya near Yasaka' }),
    });

    expect(screen.queryByRole('button', { name: /^Swap/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent('Day 2 · Tue 13');
    expect(row).toHaveTextContent('Fushimi Inari');
    expect(screen.getByText('Machiya near Yasaka')).toBeInTheDocument();

    // Opening it is reading, not writing.
    await user.click(row);
    expect(onToggle).toHaveBeenCalled();
  });

  it('puts the chevron before the swap, the order the open day matches', () => {
    renderRow({ swapChoices: TRIP_DAYS, onSwapDay: vi.fn() });

    const toggle = row().firstElementChild as HTMLElement;
    const swap = screen.getByRole('button', { name: 'Swap Day 2 · Tue 13 with another day' });

    expect(toggle.tagName).toBe('BUTTON');
    // The chevron closes the toggle's three columns…
    expect(toggle.lastElementChild?.tagName.toLowerCase()).toBe('svg');
    // …and the swap follows the whole button.
    expect(toggle.compareDocumentPosition(swap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
