/**
 * Pure helpers for the hourly schedule — day-tab derivation, grouping and
 * ordering. No React, no fetching, so they're cheap to unit test directly.
 */
import type { Entry, ScheduleItem } from '../../api/types';
import { formatDayTab, parseDay } from '../../lib/formatDates';

export interface DayTab {
  /** ISO `YYYY-MM-DD`. For dateless trips this is an internal anchor date
   * that is never shown — only the label is. */
  day: string;
  label: string;
}

/** Arbitrary, fixed anchor for trips with no dates yet, so "Day 1" always
 * resolves to the same underlying date across a session (schedule_items.day
 * is a real date column — there is no separate "day index" field). */
export const DATELESS_ANCHOR = '2000-01-01';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function addDays(iso: string, days: number): string {
  const date = parseDay(iso);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function diffDays(a: string, b: string): number {
  return Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86_400_000);
}

/**
 * Day tabs for the schedule. With trip dates, one tab per calendar day in
 * range, labelled `Mon 16`. Without dates, tabs are anchored to
 * `DATELESS_ANCHOR` and labelled sequentially `Day 1`, `Day 2`, ...
 * `extraDays` lets the caller grow the count client-side (an "add a day"
 * affordance) since the data model has no field for "how many days does
 * this dateless trip have" — see the frontend agent's report for why.
 */
export function daysForTrip(
  trip: Pick<Entry, 'starts_on' | 'ends_on'>,
  itemDays: string[] = [],
  extraDays = 0,
): DayTab[] {
  if (trip.starts_on && trip.ends_on) {
    const tabs: DayTab[] = [];
    let cursor = trip.starts_on;
    let guard = 0;
    while (cursor <= trip.ends_on && guard < 366) {
      tabs.push({ day: cursor, label: formatDayTab(cursor) });
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return tabs;
  }

  const maxKnownIndex = itemDays.reduce((max, d) => Math.max(max, diffDays(d, DATELESS_ANCHOR)), -1);
  const count = Math.max(1, extraDays, maxKnownIndex + 1);
  return Array.from({ length: count }, (_, i) => ({
    day: addDays(DATELESS_ANCHOR, i),
    label: `Day ${i + 1}`,
  }));
}

export function itemsForDay(items: ScheduleItem[], day: string): ScheduleItem[] {
  return items.filter((item) => item.day === day);
}

/** Timed items in time order first, then untimed items (no start minute set
 * yet — "day chosen, time not") after, tied-broken by `position`. */
export function sortDayItems(items: ScheduleItem[]): ScheduleItem[] {
  return [...items].sort((a, b) => {
    if (a.starts_at_minutes === null && b.starts_at_minutes === null) return a.position - b.position;
    if (a.starts_at_minutes === null) return 1;
    if (b.starts_at_minutes === null) return -1;
    return a.starts_at_minutes - b.starts_at_minutes || a.position - b.position;
  });
}

export function entryFor(entries: Entry[], id: number | null): Entry | undefined {
  if (id === null) return undefined;
  return entries.find((e) => e.id === id);
}

/** The unscheduled tray: trip ideas and bundles nothing has placed yet. */
export function unplacedIdeas(entries: Entry[]): Entry[] {
  return entries.filter((e) => (e.kind === 'idea' || e.kind === 'bundle') && !e.scheduled);
}

export function isTransportItem(item: ScheduleItem, entries: Entry[]): boolean {
  const entry = entryFor(entries, item.entry_id);
  return entry?.category === 'transport';
}
