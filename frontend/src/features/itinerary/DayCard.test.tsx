import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import type { DayVersion, EntrySummary, ItineraryItem } from '../../api/types';
import { DayCard } from './DayCard';
import type { ItineraryDay } from './itineraryModel';

function summary(id: number, title: string, kind: EntrySummary['kind'] = 'idea'): EntrySummary {
  return { id, kind, title, category: 'place', duration_minutes: 120, location_name: 'Kyoto south' };
}

function item(overrides: Partial<ItineraryItem> & { id: number }): ItineraryItem {
  return {
    trip_id: 1,
    entry_id: 7,
    chosen_entry_id: null,
    day: '2026-10-13',
    day_version_id: 1,
    starts_at_minutes: 8 * 60,
    ends_at_minutes: 12 * 60 + 30,
    note: null,
    position: 0,
    entry: summary(7, 'Fushimi Inari'),
    members: [],
    ...overrides,
  };
}

function version(id: number, name: string, items: ItineraryItem[], position = 0): DayVersion {
  return { id, trip_day_id: 1, name, position, archived_at: null, schedule_items: items };
}

const BUNDLE_ITEM = item({
  id: 50,
  entry: summary(20, 'Tuesday south', 'bundle'),
  starts_at_minutes: 8 * 60,
  ends_at_minutes: 12 * 60 + 30,
  members: [summary(21, 'Fushimi Inari'), summary(22, 'Daiso, Kyoto Station')],
});

const LOOSE_ITEM = item({
  id: 51,
  entry: summary(23, 'Nishiki Market'),
  starts_at_minutes: 18 * 60 + 30,
  ends_at_minutes: 20 * 60,
});

function day(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    day: '2026-10-13',
    number: 2,
    label: 'Day 2 · Tue 13',
    tripDay: null,
    versions: [version(1, 'Version A', [BUNDLE_ITEM, LOOSE_ITEM])],
    archivedVersions: [],
    lodgingTitle: null,
    lodgingEntryId: null,
    lodgingLabel: null,
    ...overrides,
  };
}

const HANDLERS = () => ({
  onToggle: vi.fn(),
  onFork: vi.fn(),
  onKeepVersion: vi.fn(),
  onAddItem: vi.fn(),
  onEditTime: vi.fn(),
  onRemoveItem: vi.fn(),
  onSetLodging: vi.fn(),
});

/** DayCard is a drop target, so it only exists inside a DndContext. */
function renderCard(props: Partial<Parameters<typeof DayCard>[0]> = {}) {
  const handlers = HANDLERS();
  render(
    <DndContext>
      <DayCard
        day={props.day ?? day()}
        lodgingChoices={props.lodgingChoices ?? [summary(30, 'Machiya near Yasaka')]}
        addChoices={props.addChoices ?? [summary(40, 'Kinkaku-ji')]}
        {...handlers}
        {...props}
      />
    </DndContext>,
  );
  return handlers;
}

describe('DayCard — the open day', () => {
  it('names the day and draws its running order', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'Day 2 · Tue 13' })).toBeInTheDocument();
    expect(screen.getByText('Bundle · Tuesday south')).toBeInTheDocument();
    expect(screen.getByText('Daiso, Kyoto Station')).toBeInTheDocument();
    expect(screen.getByText('Nishiki Market')).toBeInTheDocument();
  });

  // "Every idea is one 15px regular line with its time in mono at a fixed
  // 104px column. A bundle member and a loose idea look identical."
  // (itinerary-decisions.md). The hours are derived, never stored: each member
  // shows its share of the band's span.
  it('gives every bundle member its share of the band’s hours', () => {
    renderCard();

    // 08:00–12:30 is 4 hr 30, split evenly between two 2-hour members.
    expect(screen.getByText('08:00–10:15')).toBeInTheDocument();
    expect(screen.getByText('10:15–12:30')).toBeInTheDocument();
  });

  it('leaves a member blank when the bundle itself has no hours yet', () => {
    renderCard({
      day: day({
        versions: [
          version(1, 'Version A', [{ ...BUNDLE_ITEM, starts_at_minutes: null, ends_at_minutes: null }]),
        ],
      }),
    });

    expect(screen.getByText('Daiso, Kyoto Station')).toBeInTheDocument();
    expect(screen.queryByText(/08:00/)).not.toBeInTheDocument();
  });

  it('draws the hole between two things', () => {
    renderCard();

    expect(screen.getByText('Nothing planned · 6 hr')).toBeInTheDocument();
  });

  it('closes again from the header', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();

    await user.click(screen.getByRole('button', { name: 'Close Day 2 · Tue 13' }));

    expect(handlers.onToggle).toHaveBeenCalled();
  });
});

describe('DayCard — versions', () => {
  it('offers to fork a day that has one plan', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();

    await user.click(screen.getByRole('button', { name: 'Fork this day' }));

    expect(handlers.onFork).toHaveBeenCalled();
  });

  it('offers another one once the day is already split', () => {
    renderCard({ day: day({ versions: [version(1, 'Version A', []), version(2, 'Version B', [], 1)] }) });

    expect(screen.getByRole('button', { name: 'Add another' })).toBeInTheDocument();
    expect(screen.getByText('2 versions · not settled')).toBeInTheDocument();
  });

  it('settles a split day on the version you keep', async () => {
    const user = userEvent.setup();
    const handlers = renderCard({
      day: day({ versions: [version(1, 'Version A', []), version(2, 'Version B', [], 1)] }),
    });

    await user.click(screen.getByRole('button', { name: /Keep Version B/ }));

    expect(handlers.onKeepVersion).toHaveBeenCalledWith(2);
  });
});

describe('DayCard — placing things', () => {
  it('adds to the day without any dragging at all', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();

    await user.click(screen.getByRole('button', { name: '+ add to this day' }));
    expect(screen.getByText('Kept and not placed yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Kinkaku-ji/ }));

    // No slot: the container is the one that knows where the next free hour is.
    expect(handlers.onAddItem).toHaveBeenCalledWith(1, 40, null);
  });

  it('fills a hole over exactly the hours the hole leaves free', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();

    await user.click(screen.getByRole('button', { name: 'Fill it' }));
    // Twice now: on the gap row itself and on the picker it opened.
    expect(screen.getAllByText('12:30–18:30')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /Kinkaku-ji/ }));

    expect(handlers.onAddItem).toHaveBeenCalledWith(1, 40, { start: 12 * 60 + 30, end: 18 * 60 + 30 });
  });

  it('closes the picker without placing anything', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();

    await user.click(screen.getByRole('button', { name: '+ add to this day' }));
    await user.click(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByText('Kept and not placed yet')).not.toBeInTheDocument();
    expect(handlers.onAddItem).not.toHaveBeenCalled();
  });
});

describe('DayCard — editing what is on the day', () => {
  it('changes an item’s hours from its own time column', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();

    await user.click(screen.getByRole('button', { name: 'Change the hours for Nishiki Market, now 18:30–20:00' }));
    await user.clear(screen.getByLabelText('Starts for Nishiki Market'));
    await user.type(screen.getByLabelText('Starts for Nishiki Market'), '19:00');
    await user.click(screen.getByRole('button', { name: 'Set the hours' }));

    expect(handlers.onEditTime).toHaveBeenCalledWith(51, 19 * 60, 20 * 60);
  });

  it('takes a thing off the day without touching the idea itself', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();

    await user.click(screen.getByRole('button', { name: 'Take Nishiki Market off this day' }));

    expect(handlers.onRemoveItem).toHaveBeenCalledWith(51);
  });
});

describe('DayCard — lodging', () => {
  it('offers the night when nothing is set for it', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Say where you sleep' }));

    expect(screen.getByText('Kept places, or your own words')).toBeInTheDocument();
  });

  it('sets a kept place, clearing any free text with it', async () => {
    const user = userEvent.setup();
    const handlers = renderCard();

    await user.click(screen.getByRole('button', { name: 'Say where you sleep' }));
    await user.click(screen.getByRole('button', { name: 'Machiya near Yasaka' }));

    expect(handlers.onSetLodging).toHaveBeenCalledWith({ lodging_entry_id: 30, lodging_label: null });
  });

  it('sets your own words, clearing any kept place with them', async () => {
    const user = userEvent.setup();
    const handlers = renderCard({ day: day({ lodgingTitle: 'Machiya near Yasaka', lodgingEntryId: 30 }) });

    await user.click(screen.getByRole('button', { name: 'Where you sleep: Machiya near Yasaka. Change it.' }));
    await user.type(screen.getByLabelText('Where you sleep, in your own words'), 'Sleeping on the plane');
    await user.click(screen.getByRole('button', { name: 'Use what I wrote' }));

    expect(handlers.onSetLodging).toHaveBeenCalledWith({
      lodging_entry_id: null,
      lodging_label: 'Sleeping on the plane',
    });
  });

  it('clears the night with both keys, which is what the endpoint wants', async () => {
    const user = userEvent.setup();
    const handlers = renderCard({ day: day({ lodgingTitle: 'Night bus', lodgingLabel: 'Night bus' }) });

    await user.click(screen.getByRole('button', { name: 'Where you sleep: Night bus. Change it.' }));
    await user.click(screen.getByRole('button', { name: 'Clear it' }));

    expect(handlers.onSetLodging).toHaveBeenCalledWith({ lodging_entry_id: null, lodging_label: null });
  });
});

describe('DayCard — as a drop target', () => {
  it('marks itself when the container says the drag is over it', () => {
    renderCard({ isDropTarget: true });

    expect(screen.getByRole('heading', { name: 'Day 2 · Tue 13' }).closest('[data-drop-target]')).not.toBeNull();
  });
});
