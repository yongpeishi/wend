import { describe, expect, it } from 'vitest';
import { buildPlanRows, dayChips, nowLine, openingDay } from './dayPlan';
import type { PlanRow } from './dayPlan';
import type { Entry, ScheduleItem } from '../../api/types';

const DAY = '2026-11-02';
/** The clock is always explicit in these tests — never `new Date()`. */
const AT_1330 = new Date(2026, 10, 2, 13, 30);
/** Same wall-clock minute, a day later: the day on screen is no longer today. */
const TOMORROW_1330 = new Date(2026, 10, 3, 13, 30);

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

function makeItem(overrides: Partial<ScheduleItem>): ScheduleItem {
  return {
    id: 1,
    trip_id: 1,
    entry_id: null,
    chosen_entry_id: null,
    day: DAY,
    day_version_id: null,
    starts_at_minutes: null,
    ends_at_minutes: null,
    note: null,
    position: 0,
    ...overrides,
  };
}

function statesOf(items: ScheduleItem[], entries: Entry[], now: Date): string[] {
  return buildPlanRows(items, entries, { day: DAY, now }).map((row) => row.state);
}

describe('dayChips', () => {
  it('splits a dated tab into an uppercase weekday and a bare day number', () => {
    const chips = dayChips([
      { day: '2026-11-02', label: 'Mon 2' },
      { day: '2026-11-13', label: 'Fri 13' },
    ]);
    expect(chips).toEqual([
      { day: '2026-11-02', dow: 'MON', date: '2' },
      { day: '2026-11-13', dow: 'FRI', date: '13' },
    ]);
  });

  it('reads the day number back out of a dateless trip’s label', () => {
    const chips = dayChips([
      { day: '2000-01-01', label: 'Day 1' },
      { day: '2000-01-02', label: 'Day 2' },
    ]);
    expect(chips).toEqual([
      { day: '2000-01-01', dow: 'DAY', date: '1' },
      { day: '2000-01-02', dow: 'DAY', date: '2' },
    ]);
  });
});

describe('openingDay', () => {
  const trip = [
    { day: '2026-11-01', label: 'Sun 1' },
    { day: '2026-11-02', label: 'Mon 2' },
    { day: '2026-11-03', label: 'Tue 3' },
  ];

  it('opens on today when the clock is somewhere inside the trip', () => {
    expect(openingDay(trip, AT_1330)).toBe('2026-11-02');
    expect(openingDay(trip, new Date(2026, 10, 3, 0, 1))).toBe('2026-11-03');
  });

  it('opens on the first day before the trip starts and after it ends', () => {
    expect(openingDay(trip, new Date(2026, 9, 30, 13, 30))).toBe('2026-11-01');
    expect(openingDay(trip, new Date(2026, 11, 25, 13, 30))).toBe('2026-11-01');
  });

  it('compares local calendar dates, not a UTC ISO slice', () => {
    // Late enough to be tomorrow in UTC east of Greenwich, early enough to be
    // yesterday west of it. Locally it is still the 2nd either way.
    expect(openingDay(trip, new Date(2026, 10, 2, 23, 45))).toBe('2026-11-02');
    expect(openingDay(trip, new Date(2026, 10, 2, 0, 15))).toBe('2026-11-02');
  });

  it('falls back to the first day of a dateless trip, and to nothing at all', () => {
    // A dateless trip's tabs hang off a fixed anchor year that is never today.
    expect(openingDay([{ day: '2000-01-01', label: 'Day 1' }], AT_1330)).toBe('2000-01-01');
    expect(openingDay([], AT_1330)).toBe('');
  });
});

describe('buildPlanRows — shape', () => {
  it('orders rows the way sortDayItems does and formats time, title and meta', () => {
    const entries = [
      makeEntry({ id: 1, title: 'Fushimi Inari', category: 'place' }),
      makeEntry({ id: 2, title: 'Ramen', category: 'food' }),
    ];
    const items = [
      makeItem({ id: 20, entry_id: 2, starts_at_minutes: 20 * 60 + 30 }),
      makeItem({ id: 10, entry_id: 1, starts_at_minutes: 13 * 60, ends_at_minutes: 15 * 60 + 40 }),
      makeItem({ id: 30, entry_id: null, starts_at_minutes: null, position: 4 }),
    ];

    const rows = buildPlanRows(items, entries, { day: DAY, now: AT_1330 });

    expect(rows.map((r) => r.id)).toEqual([10, 20, 30]);
    expect(rows.map((r) => r.time)).toEqual(['13:00–15:40', '20:30', '']);
    expect(rows.map((r) => r.title)).toEqual(['Fushimi Inari', 'Ramen', 'Untitled']);
    expect(rows.map((r) => r.meta)).toEqual(['Place', 'Food', '']);
    expect(rows[0]?.startsAtMinutes).toBe(13 * 60);
    expect(rows[0]?.endsAtMinutes).toBe(15 * 60 + 40);
  });

  it('carries the bundle id only when the item points at a bundle', () => {
    const entries = [
      makeEntry({ id: 7, kind: 'bundle', title: 'Dinner options' }),
      makeEntry({ id: 8, kind: 'idea', title: 'Nanzen-ji' }),
    ];
    const rows = buildPlanRows(
      [makeItem({ id: 1, entry_id: 7, chosen_entry_id: 8, position: 0 }),
        makeItem({ id: 2, entry_id: 8, position: 1 })],
      entries,
      { day: DAY, now: AT_1330 },
    );
    expect(rows[0]).toMatchObject({ entryId: 7, bundleId: 7, chosenEntryId: 8 });
    expect(rows[1]).toMatchObject({ entryId: 8, bundleId: null, chosenEntryId: null });
  });

  it('tones the dot by category', () => {
    const entries = [
      makeEntry({ id: 1, category: 'transport' }),
      makeEntry({ id: 2, category: 'lodging' }),
      makeEntry({ id: 3, category: 'food' }),
      makeEntry({ id: 4, category: null }),
    ];
    const items = [1, 2, 3, 4].map((id) => makeItem({ id, entry_id: id, position: id }));
    expect(buildPlanRows(items, entries, { day: DAY, now: AT_1330 }).map((r) => r.tone))
      .toEqual(['waiting', 'destination', 'decided', 'decided']);
    // An item pointing at nothing at all still gets a tone.
    expect(buildPlanRows([makeItem({ entry_id: null })], entries, { day: DAY, now: AT_1330 })[0]?.tone)
      .toBe('decided');
  });
});

describe('buildPlanRows — the dur cascade', () => {
  function durFor(item: Partial<ScheduleItem>, entry: Partial<Entry> | null): string {
    const entries = entry ? [makeEntry({ id: 9, ...entry })] : [];
    const rows = buildPlanRows(
      [makeItem({ entry_id: entry ? 9 : null, ...item })],
      entries,
      { day: DAY, now: AT_1330 },
    );
    return rows[0]?.dur as string;
  }

  it('1. transport wins over every other reading of the clock', () => {
    expect(durFor(
      { starts_at_minutes: 9 * 60, ends_at_minutes: 10 * 60 },
      { category: 'transport', duration_minutes: 45 },
    )).toBe('transport');
  });

  it('2. an undecided bundle is "open"', () => {
    expect(durFor(
      { starts_at_minutes: 19 * 60, ends_at_minutes: 21 * 60, chosen_entry_id: null },
      { kind: 'bundle', duration_minutes: 90 },
    )).toBe('open');
  });

  it('2b. a decided bundle falls through to the times', () => {
    expect(durFor(
      { starts_at_minutes: 19 * 60, ends_at_minutes: 21 * 60, chosen_entry_id: 4 },
      { kind: 'bundle' },
    )).toBe('2 hr');
  });

  it('3. start and end present — the placed length, not the entry’s', () => {
    expect(durFor(
      { starts_at_minutes: 13 * 60, ends_at_minutes: 15 * 60 + 40 },
      { duration_minutes: 30 },
    )).toBe('2 hr 40 min');
    expect(durFor({ starts_at_minutes: 9 * 60, ends_at_minutes: 9 * 60 + 40 }, {})).toBe('40 min');
  });

  it('4. only a start — the entry’s own duration', () => {
    expect(durFor({ starts_at_minutes: 20 * 60 }, { duration_minutes: 90 })).toBe('1 hr 30 min');
  });

  it('5. nothing known at all is empty', () => {
    expect(durFor({ starts_at_minutes: 20 * 60 }, { duration_minutes: null })).toBe('');
    expect(durFor({}, null)).toBe('');
  });
});

describe('buildPlanRows — the state table', () => {
  const entries = [makeEntry({ id: 1, title: 'Morning walk' }), makeEntry({ id: 2, title: 'Lunch' })];

  function timed(id: number, start: number, end: number | null): ScheduleItem {
    return makeItem({ id, entry_id: 1, starts_at_minutes: start, ends_at_minutes: end, position: id });
  }

  it('reads past, now and upcoming off today’s clock', () => {
    const items = [
      timed(1, 9 * 60, 10 * 60), // ended
      timed(2, 13 * 60, 15 * 60), // running at 13:30
      timed(3, 20 * 60, 21 * 60), // still ahead
    ];
    expect(statesOf(items, entries, AT_1330)).toEqual(['past', 'now', 'upcoming']);
  });

  it('counts an item as past the minute it ends, and as now the minute it starts', () => {
    expect(statesOf([timed(1, 12 * 60, 13 * 60 + 30)], entries, AT_1330)).toEqual(['past']);
    expect(statesOf([timed(1, 13 * 60 + 30, 14 * 60)], entries, AT_1330)).toEqual(['now']);
  });

  it('treats an item with no end as an item one minute long', () => {
    expect(statesOf([timed(1, 13 * 60 + 30, null)], entries, AT_1330)).toEqual(['now']);
    expect(statesOf([timed(1, 13 * 60 + 29, null)], entries, AT_1330)).toEqual(['past']);
    expect(statesOf([timed(1, 13 * 60 + 31, null)], entries, AT_1330)).toEqual(['upcoming']);
  });

  it('lets at most one row be "now" — later overlaps are upcoming', () => {
    const items = [
      timed(1, 13 * 60, 15 * 60),
      timed(2, 13 * 60 + 10, 15 * 60),
      timed(3, 13 * 60 + 20, 14 * 60),
    ];
    expect(statesOf(items, entries, AT_1330)).toEqual(['now', 'upcoming', 'upcoming']);
  });

  it('is silent on any day that is not today — everything is upcoming', () => {
    const items = [timed(1, 9 * 60, 10 * 60), timed(2, 13 * 60, 15 * 60)];
    expect(statesOf(items, entries, TOMORROW_1330)).toEqual(['upcoming', 'upcoming']);
    // And on a day the clock has not reached yet.
    expect(statesOf(items, entries, new Date(2026, 9, 30, 13, 30))).toEqual(['upcoming', 'upcoming']);
  });

  it('compares local calendar dates, not a UTC ISO slice', () => {
    // 23:30 local on the shown day is already the next day in UTC east of
    // Greenwich, and the previous one west of it. Either way it is still today.
    const items = [timed(1, 9 * 60, 10 * 60)];
    expect(statesOf(items, entries, new Date(2026, 10, 2, 23, 30))).toEqual(['past']);
    expect(statesOf(items, entries, new Date(2026, 10, 2, 0, 15))).toEqual(['upcoming']);
  });

  it('leaves an untimed row upcoming', () => {
    const item = makeItem({ id: 1, entry_id: 1, starts_at_minutes: null });
    expect(statesOf([item], entries, AT_1330)).toEqual(['upcoming']);
  });

  it('lets an undecided bundle beat the clock, whatever the hour', () => {
    const bundle = makeEntry({ id: 5, kind: 'bundle', title: 'Dinner options' });
    const undecided = makeItem({ id: 1, entry_id: 5, starts_at_minutes: 9 * 60, ends_at_minutes: 10 * 60 });
    expect(statesOf([undecided], [bundle], AT_1330)).toEqual(['open']);
    // Untimed, and on another day, it is still the same open question.
    expect(statesOf([makeItem({ id: 1, entry_id: 5 })], [bundle], AT_1330)).toEqual(['open']);
    expect(statesOf([undecided], [bundle], TOMORROW_1330)).toEqual(['open']);
    // Once chosen it rejoins the clock.
    const decided = makeItem({ ...undecided, chosen_entry_id: 6 });
    expect(statesOf([decided], [bundle], AT_1330)).toEqual(['past']);
  });

  it('does not let an open row use up the single "now"', () => {
    const entriesWithBundle = [...entries, makeEntry({ id: 5, kind: 'bundle', title: 'Dinner options' })];
    const items = [
      makeItem({ id: 1, entry_id: 5, starts_at_minutes: 13 * 60, ends_at_minutes: 14 * 60, position: 0 }),
      timed(2, 13 * 60 + 15, 14 * 60),
    ];
    expect(statesOf(items, entriesWithBundle, AT_1330)).toEqual(['open', 'now']);
  });
});

describe('nowLine', () => {
  function row(overrides: Partial<PlanRow>): PlanRow {
    return {
      id: 1,
      time: '',
      dur: '',
      title: 'Untitled',
      meta: '',
      state: 'upcoming',
      tone: 'decided',
      entryId: null,
      bundleId: null,
      chosenEntryId: null,
      startsAtMinutes: null,
      endsAtMinutes: null,
      ...overrides,
    };
  }

  it('names what you are on, until when, and what follows', () => {
    const rows = [
      row({ id: 1, title: 'Fushimi Inari', state: 'now', startsAtMinutes: 13 * 60, endsAtMinutes: 15 * 60 + 40 }),
      row({ id: 2, title: 'Ramen', startsAtMinutes: 20 * 60 + 30 }),
    ];
    expect(nowLine(rows, { day: DAY, now: AT_1330 })).toEqual({
      title: 'Fushimi Inari',
      sub: 'Until 15:40 · then Ramen at 20:30',
    });
  });

  it('drops the "until" half when the now row has no end', () => {
    const rows = [
      row({ id: 1, title: 'Fushimi Inari', state: 'now', startsAtMinutes: 13 * 60 }),
      row({ id: 2, title: 'Ramen', startsAtMinutes: 20 * 60 + 30 }),
    ];
    expect(nowLine(rows, { day: DAY, now: AT_1330 }).sub).toBe('then Ramen at 20:30');
  });

  it('drops the "then" half when nothing later has a time', () => {
    const rows = [
      row({ id: 1, title: 'Fushimi Inari', state: 'now', startsAtMinutes: 13 * 60, endsAtMinutes: 15 * 60 }),
      row({ id: 2, title: 'Somewhere for a drink' }),
    ];
    expect(nowLine(rows, { day: DAY, now: AT_1330 })).toEqual({
      title: 'Fushimi Inari',
      sub: 'Until 15:00',
    });
  });

  /* Overlapping items are legal here — an evening can be double-booked — but a
     "then" that has already begun turns the sentence back on itself. */
  it('will not call something that starts before this one ends the next thing', () => {
    const rows = [
      row({ id: 1, title: 'Kyoto walk', state: 'now', startsAtMinutes: 18 * 60, endsAtMinutes: 19 * 60 + 7 }),
      row({ id: 2, title: 'Kyoto dinner options', startsAtMinutes: 18 * 60 + 30 }),
    ];
    expect(nowLine(rows, { day: DAY, now: AT_1330 })).toEqual({
      title: 'Kyoto walk',
      sub: 'Until 19:07',
    });
  });

  it('takes the first row that starts once this one is done, overlaps skipped', () => {
    const rows = [
      row({ id: 1, title: 'Kyoto walk', state: 'now', startsAtMinutes: 18 * 60, endsAtMinutes: 19 * 60 + 7 }),
      row({ id: 2, title: 'Kyoto dinner options', startsAtMinutes: 18 * 60 + 30 }),
      row({ id: 3, title: 'Last train', startsAtMinutes: 23 * 60 }),
    ];
    expect(nowLine(rows, { day: DAY, now: AT_1330 }).sub).toBe('Until 19:07 · then Last train at 23:00');
    // A row starting on the exact minute this one ends is still after it.
    const onTheMinute = [rows[0] as PlanRow, row({ id: 4, title: 'Bus', startsAtMinutes: 19 * 60 + 7 })];
    expect(nowLine(onTheMinute, { day: DAY, now: AT_1330 }).sub).toBe('Until 19:07 · then Bus at 19:07');
  });

  it('measures an endless now row from its own start instead', () => {
    const rows = [
      row({ id: 1, title: 'Kyoto walk', state: 'now', startsAtMinutes: 18 * 60 }),
      row({ id: 2, title: 'Something earlier', startsAtMinutes: 17 * 60 }),
      row({ id: 3, title: 'Dinner', startsAtMinutes: 20 * 60 }),
    ];
    expect(nowLine(rows, { day: DAY, now: AT_1330 }).sub).toBe('then Dinner at 20:00');
  });

  it('points at the next thing when nothing is running', () => {
    const rows = [
      row({ id: 1, title: 'Morning walk', state: 'past', startsAtMinutes: 9 * 60, endsAtMinutes: 10 * 60 }),
      row({ id: 2, title: 'Ramen', state: 'upcoming', startsAtMinutes: 20 * 60 + 30 }),
    ];
    expect(nowLine(rows, { day: DAY, now: AT_1330 })).toEqual({
      title: 'Nothing planned',
      sub: 'Next: Ramen at 20:30',
    });
  });

  it('does not offer an hour that has already gone by as next', () => {
    const rows = [
      row({ id: 1, title: 'Morning walk', state: 'past', startsAtMinutes: 9 * 60, endsAtMinutes: 10 * 60 }),
    ];
    expect(nowLine(rows, { day: DAY, now: AT_1330 })).toEqual({
      title: 'Nothing planned yet',
      sub: 'A loose day is fine',
    });
  });

  it('on another day every timed row is still ahead of you', () => {
    const rows = [
      row({ id: 1, title: 'Morning walk', startsAtMinutes: 9 * 60, endsAtMinutes: 10 * 60 }),
    ];
    expect(nowLine(rows, { day: DAY, now: TOMORROW_1330 })).toEqual({
      title: 'Nothing planned',
      sub: 'Next: Morning walk at 09:00',
    });
  });

  it('settles for a loose day when there is nothing to say', () => {
    expect(nowLine([], { day: DAY, now: AT_1330 })).toEqual({
      title: 'Nothing planned yet',
      sub: 'A loose day is fine',
    });
    const untimed = [row({ id: 1, title: 'Somewhere for a drink' })];
    expect(nowLine(untimed, { day: DAY, now: AT_1330 })).toEqual({
      title: 'Nothing planned yet',
      sub: 'A loose day is fine',
    });
  });
});
