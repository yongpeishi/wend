import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import type { DayVersion, EntrySummary, ItineraryItem } from '../../api/types';
import { versionDroppableId } from './useDayDrop';
import { VersionColumns } from './VersionColumns';

const DAY = '2026-10-15';

function summary(id: number, title: string, kind: EntrySummary['kind'] = 'idea'): EntrySummary {
  return { id, kind, title, category: 'place', duration_minutes: 60 };
}

function item(overrides: Partial<ItineraryItem> & { id: number }): ItineraryItem {
  return {
    trip_id: 1,
    entry_id: 7,
    chosen_entry_id: null,
    day: '2026-10-15',
    day_version_id: 1,
    starts_at_minutes: 9 * 60,
    ends_at_minutes: 11 * 60,
    note: null,
    position: 0,
    entry: summary(7, 'Kinkaku-ji'),
    members: [],
    ...overrides,
  };
}

function version(overrides: Partial<DayVersion> & { id: number }): DayVersion {
  return {
    trip_day_id: 1,
    name: 'Version A',
    position: 0,
    archived_at: null,
    schedule_items: [],
    ...overrides,
  };
}

const VERSION_A = version({
  id: 1,
  name: 'Version A',
  schedule_items: [
    item({ id: 101, starts_at_minutes: 10 * 60, ends_at_minutes: 12 * 60, entry: summary(7, 'Travel day') }),
    item({ id: 102, starts_at_minutes: 13 * 60, ends_at_minutes: 15 * 60, entry: summary(8, 'Osaka Castle grounds') }),
  ],
});

const VERSION_B = version({
  id: 2,
  name: 'Version B',
  position: 1,
  schedule_items: [item({ id: 201, starts_at_minutes: 9 * 60, ends_at_minutes: 11 * 60 })],
});

/** Every column is a drop target, so the columns only exist in a DndContext. */
function renderColumns(props: Partial<Parameters<typeof VersionColumns>[0]> = {}) {
  const onKeep = vi.fn();
  render(
    <DndContext>
      <VersionColumns
        day={DAY}
        versions={props.versions ?? [VERSION_A, VERSION_B]}
        dayLabel="Day 4 · Wed 15"
        onKeep={props.onKeep ?? onKeep}
        onFill={props.onFill}
        onEditTime={props.onEditTime}
        onRemoveItem={props.onRemoveItem}
        onAdd={props.onAdd}
        readOnly={props.readOnly}
        promptItemId={props.promptItemId}
        promptDayName={props.promptDayName}
        onPromptDismiss={props.onPromptDismiss}
      />
    </DndContext>,
  );
  return { onKeep };
}

describe('VersionColumns', () => {
  it('shows both ways to spend the day side by side', () => {
    renderColumns();

    expect(screen.getByRole('heading', { name: 'Version A' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Version B' })).toBeInTheDocument();
    expect(screen.getByText('Osaka Castle grounds')).toBeInTheDocument();
  });

  it('says how long each version runs and how much is in it', () => {
    renderColumns();

    expect(screen.getByText('4 hr · 2 things')).toBeInTheDocument();
    expect(screen.getByText('2 hr · 1 thing')).toBeInTheDocument();
  });

  it('draws the hole between two things inside a column', () => {
    renderColumns();

    expect(screen.getByText('Nothing planned · 1 hr')).toBeInTheDocument();
  });

  it('gives every version a Keep button that says which day it settles', () => {
    renderColumns();

    expect(
      screen.getByRole('button', { name: 'Keep Version A for Day 4 · Wed 15, and archive the rest' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Keep Version B for Day 4 · Wed 15, and archive the rest' }),
    ).toBeInTheDocument();
  });

  it('settles the day on the version you keep', async () => {
    const user = userEvent.setup();
    const { onKeep } = renderColumns();

    await user.click(screen.getByRole('button', { name: /Keep Version B/ }));

    expect(onKeep).toHaveBeenCalledWith(2);
  });

  it('says plainly when a version has nothing in it yet', () => {
    renderColumns({ versions: [VERSION_A, version({ id: 3, name: 'Version C' })] });

    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('adds to one version rather than to the day, while the day is split', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderColumns({ onAdd });

    await user.click(screen.getByRole('button', { name: '+ add to Version B' }));

    expect(onAdd).toHaveBeenCalledWith(2);
  });

  it('fills a hole into the version that has it', async () => {
    const user = userEvent.setup();
    const onFill = vi.fn();
    renderColumns({ onFill });

    await user.click(screen.getByRole('button', { name: 'Fill it' }));

    expect(onFill).toHaveBeenCalledWith(1, { start: 12 * 60, end: 13 * 60 });
  });

  it('keeps editing available in both columns — a split day is still being planned', async () => {
    const user = userEvent.setup();
    const onRemoveItem = vi.fn();
    renderColumns({ onRemoveItem, onEditTime: vi.fn() });

    const columnB = screen.getByRole('heading', { name: 'Version B' }).closest('div')?.parentElement as HTMLElement;
    await user.click(within(columnB).getByRole('button', { name: 'Take Kinkaku-ji off this day' }));

    expect(onRemoveItem).toHaveBeenCalledWith(201);
  });

  // Being able to see that a day is still two ways round is the whole of what
  // this component says, so a viewer keeps both columns whole. What goes is
  // the verdict: settling the day is not theirs to hand down.
  it('keeps both columns whole for a viewer, and offers no way to settle between them', () => {
    renderColumns({ readOnly: true, onAdd: vi.fn(), onFill: vi.fn(), onEditTime: vi.fn(), onRemoveItem: vi.fn() });

    expect(screen.getByRole('heading', { name: 'Version A' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Version B' })).toBeInTheDocument();
    expect(screen.getByText('Osaka Castle grounds')).toBeInTheDocument();
    expect(screen.getByText('4 hr · 2 things')).toBeInTheDocument();
    // The hole is still drawn — it is part of what the version looks like.
    expect(screen.getByText('Nothing planned · 1 hr')).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /^Keep Version/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^\+ add to Version/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fill it' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /off this day$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /the hours for/ })).not.toBeInTheDocument();
  });

  // 034-itinerary-time, Option A: a thing just placed lands untimed and the
  // "when?" prompt opens under its row. The columns hand the prompt props
  // through verbatim — item ids are unique across versions, so only the
  // column actually holding the item asks the question.
  it('opens the "when?" prompt in the column that holds the asked-about item', () => {
    renderColumns({
      promptItemId: 201,
      promptDayName: 'Wed 15',
      onPromptDismiss: vi.fn(),
      onEditTime: vi.fn(),
    });

    const columnB = document.querySelector(`[data-drop-id="${versionDroppableId(DAY, 2)}"]`) as HTMLElement;
    expect(within(columnB).getByText('On the day. When on Wed 15?')).toBeInTheDocument();
    expect(within(columnB).getByLabelText('Starts for Kinkaku-ji')).toBeInTheDocument();

    // And in no other column: one question, asked where its row is.
    const columnA = document.querySelector(`[data-drop-id="${versionDroppableId(DAY, 1)}"]`) as HTMLElement;
    expect(within(columnA).queryByText(/On the day\. When on/)).not.toBeInTheDocument();
  });

  // Feedback 014#2: with one drop target per day, a split day could only ever
  // resolve to its first live version. Each column carries its own now.
  it('makes every column a drop target of its own, named for its version', () => {
    renderColumns();

    expect(document.querySelector(`[data-drop-id="${versionDroppableId(DAY, 1)}"]`)).not.toBeNull();
    expect(document.querySelector(`[data-drop-id="${versionDroppableId(DAY, 2)}"]`)).not.toBeNull();
    expect(document.querySelectorAll('[data-drop-id]')).toHaveLength(2);
  });
});
