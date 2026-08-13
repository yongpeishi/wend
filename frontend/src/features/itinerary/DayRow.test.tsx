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
    entry: { id, kind: 'idea', title, category: 'place', duration_minutes: null, location_name: null },
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
      <DayRow day={props.day ?? day()} isDropTarget={props.isDropTarget} onToggle={props.onToggle ?? onToggle} />
    </DndContext>,
  );
  return { onToggle };
}

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

    expect(screen.getByRole('button')).toHaveAttribute('data-drop-target', 'true');
  });

  it('is unmarked the rest of the time', () => {
    renderRow();

    expect(screen.getByRole('button')).not.toHaveAttribute('data-drop-target');
  });
});
