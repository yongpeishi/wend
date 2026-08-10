import { describe, expect, it } from 'vitest';
import { daysForTrip, entryFor, isTransportItem, sortDayItems, unplacedIdeas } from './scheduleModel';
import type { Entry, ScheduleItem } from '../../api/types';

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: 1,
    kind: 'idea',
    title: 'Untitled',
    description: null,
    category: null,
    starts_on: null,
    ends_on: null,
    location_name: null,
    address: null,
    lat: null,
    lng: null,
    duration_minutes: null,
    source_url: null,
    notes: null,
    from_entry_id: null,
    to_entry_id: null,
    archived_at: null,
    created_at: '',
    updated_at: '',
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
    day: '2026-11-02',
    starts_at_minutes: null,
    ends_at_minutes: null,
    note: null,
    position: 0,
    ...overrides,
  };
}

describe('daysForTrip', () => {
  it('builds one tab per calendar day when the trip has dates', () => {
    const tabs = daysForTrip({ starts_on: '2026-11-02', ends_on: '2026-11-04' });
    expect(tabs.map((t) => t.day)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(tabs.map((t) => t.label)).toEqual(['Mon 2', 'Tue 3', 'Wed 4']);
  });

  it('falls back to sequential "Day N" tabs anchored to a fixed date when the trip has no dates', () => {
    const tabs = daysForTrip({ starts_on: null, ends_on: null });
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.label).toBe('Day 1');
  });

  it('grows the dateless day count from items already placed on later synthetic days', () => {
    const tabs = daysForTrip({ starts_on: null, ends_on: null }, ['2000-01-01', '2000-01-03']);
    expect(tabs.map((t) => t.label)).toEqual(['Day 1', 'Day 2', 'Day 3']);
  });
});

describe('sortDayItems', () => {
  it('orders items by start time, ascending', () => {
    const items = [
      makeItem({ id: 3, starts_at_minutes: 12 * 60 }),
      makeItem({ id: 1, starts_at_minutes: 9 * 60 }),
      makeItem({ id: 2, starts_at_minutes: 9 * 60 + 40 }),
    ];
    expect(sortDayItems(items).map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it('places untimed items after timed ones', () => {
    const items = [
      makeItem({ id: 1, starts_at_minutes: null, position: 0 }),
      makeItem({ id: 2, starts_at_minutes: 9 * 60 }),
    ];
    expect(sortDayItems(items).map((i) => i.id)).toEqual([2, 1]);
  });
});

describe('entryFor / unplacedIdeas / isTransportItem', () => {
  const entries = [
    makeEntry({ id: 1, kind: 'idea', title: 'Nanzen-ji', scheduled: true }),
    makeEntry({ id: 2, kind: 'idea', title: 'Kiyamachi', scheduled: false }),
    makeEntry({ id: 3, kind: 'bundle', title: 'Dinner options', scheduled: false }),
    makeEntry({ id: 4, kind: 'idea', title: 'Taxi', category: 'transport', scheduled: true }),
  ];

  it('finds an entry by id', () => {
    expect(entryFor(entries, 2)?.title).toBe('Kiyamachi');
    expect(entryFor(entries, null)).toBeUndefined();
  });

  it('lists ideas and bundles not yet scheduled', () => {
    expect(unplacedIdeas(entries).map((e) => e.id)).toEqual([2, 3]);
  });

  it('recognises a transport-category entry as a transport slot', () => {
    const item = makeItem({ entry_id: 4 });
    expect(isTransportItem(item, entries)).toBe(true);
    expect(isTransportItem(makeItem({ entry_id: 1 }), entries)).toBe(false);
  });
});
