/**
 * The day, as you read it while walking.
 *
 * Final schedule is a read surface: schedule items and entries go in, flat rows
 * of already-formatted text come out, and the components downstream do nothing
 * but place them. Everything that needs the clock takes an explicit `now`, so
 * the screen reads it once per render and the tests can freeze it.
 *
 * No React, no fetching — same reason as `scheduleModel.ts`, which this leans on
 * for ordering and lookup rather than repeating either.
 */
import type { Entry, ScheduleItem } from '../../api/types';
import { formatDuration, formatMinutes, formatTimeRange, joinMeta, parseDay } from '../../lib/formatDates';
import type { DayTab } from './scheduleModel';
import { entryFor, sortDayItems } from './scheduleModel';

/** Where a row sits relative to the clock — or 'open' when it is a choice
 *  nobody has made yet, which outranks the clock. */
export type RowState = 'past' | 'now' | 'upcoming' | 'open';

/** Which trail colour the row's dot takes when the clock has no opinion. */
export type RowTone = 'decided' | 'waiting' | 'destination';

export interface PlanRow {
  /** schedule_item id. */
  id: number;
  /** "13:00–15:40", "20:30", or '' when the item has no time yet. */
  time: string;
  /** "2 hr 40 min" | "40 min" | "transport" | "open" | ''. */
  dur: string;
  title: string;
  /** "food · Fushimi" — may be ''. */
  meta: string;
  state: RowState;
  tone: RowTone;
  entryId: number | null;
  /** Set only when the item points at a bundle — the "decide on the night" case. */
  bundleId: number | null;
  chosenEntryId: number | null;
  startsAtMinutes: number | null;
  endsAtMinutes: number | null;
}

export interface DayChip {
  /** ISO `YYYY-MM-DD`; identical to the `DayTab.day` it came from. */
  day: string;
  /** "MON", uppercase. "DAY" for a trip with no dates. */
  dow: string;
  /** "13". The day number ("1", "2") for a trip with no dates. */
  date: string;
}

export interface NowLine {
  title: string;
  sub: string;
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** A dateless trip's tabs are labelled `Day 1`, `Day 2` over an anchor date
 * that is never shown — the label is the only place that number lives, so the
 * chip reads it back out of the label rather than re-deriving it. */
const DATELESS_LABEL = /^Day (\d+)$/;

export function dayChips(days: DayTab[]): DayChip[] {
  return days.map((tab) => {
    const dateless = DATELESS_LABEL.exec(tab.label);
    if (dateless) {
      return { day: tab.day, dow: 'DAY', date: dateless[1] as string };
    }
    const date = parseDay(tab.day);
    return {
      day: tab.day,
      dow: WEEKDAYS[date.getDay()] as string,
      date: String(date.getDate()),
    };
  });
}

/** Whether the day being shown is the day the clock is on — compared as local
 * calendar dates, because `parseDay` builds a local midnight and slicing an ISO
 * timestamp would answer for UTC instead, which is a different day for half the
 * world for part of every day. */
function isToday(day: string, now: Date): boolean {
  const shown = parseDay(day);
  return (
    shown.getFullYear() === now.getFullYear() &&
    shown.getMonth() === now.getMonth() &&
    shown.getDate() === now.getDate()
  );
}

function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * The day the screen should open on: today, when the clock is inside the trip,
 * and the trip's first day otherwise — which is what you want both before you
 * leave and after you get back.
 *
 * A fortnight-long trip that opens on day one opens on a day that is usually
 * empty, and everything this screen exists to say — the now dot, the now bar,
 * the panel naming the stop you are standing in — stays invisible until the
 * reader hunts for today's chip. Opening on today is the plan you are holding.
 *
 * This is the *opening* day only. Once a reader picks a chip, that choice is
 * theirs; nothing here is re-applied over it.
 */
export function openingDay(days: DayTab[], now: Date): string {
  return days.find((tab) => isToday(tab.day, now))?.day ?? days[0]?.day ?? '';
}

function toneFor(entry: Entry | undefined): RowTone {
  if (entry?.category === 'transport') return 'waiting';
  if (entry?.category === 'lodging') return 'destination';
  return 'decided';
}

function durationFor(item: ScheduleItem, entry: Entry | undefined): string {
  if (entry?.category === 'transport') return 'transport';
  if (entry?.kind === 'bundle' && item.chosen_entry_id === null) return 'open';
  const { starts_at_minutes: start, ends_at_minutes: end } = item;
  if (start !== null && end !== null) return formatDuration(end - start) ?? '';
  return formatDuration(entry?.duration_minutes ?? null) ?? '';
}

/**
 * One row per schedule item, in `sortDayItems` order. Items are assumed already
 * filtered to `opts.day` by the caller, so we do not filter again.
 *
 * The clock only speaks on the day it is actually on: browsing tomorrow, every
 * row is 'upcoming' rather than a stale replay of today's progress. And at most
 * one row is ever 'now' — overlapping items are a plan the traveller made, not
 * two places they are standing in.
 */
export function buildPlanRows(
  items: ScheduleItem[],
  entries: Entry[],
  opts: { day: string; now: Date },
): PlanRow[] {
  const today = isToday(opts.day, opts.now);
  const m = minutesOfDay(opts.now);
  let claimedNow = false;

  return sortDayItems(items).map((item) => {
    const entry = entryFor(entries, item.entry_id);
    const start = item.starts_at_minutes;
    const end = item.ends_at_minutes;

    let state: RowState;
    if (entry?.kind === 'bundle' && item.chosen_entry_id === null) {
      // An undecided choice outranks the clock: it is still a question at
      // whatever hour you look at it.
      state = 'open';
    } else if (!today || start === null) {
      state = 'upcoming';
    } else if (m >= start && m < (end ?? start + 1)) {
      // First match wins; anything overlapping it is still ahead of you.
      state = claimedNow ? 'upcoming' : 'now';
      claimedNow = true;
    } else if ((end ?? start) <= m) {
      state = 'past';
    } else {
      state = 'upcoming';
    }

    return {
      id: item.id,
      time: formatTimeRange(start, end),
      dur: durationFor(item, entry),
      title: entry?.title ?? 'Untitled',
      meta: joinMeta(entry?.category, entry?.location_name),
      state,
      tone: toneFor(entry),
      entryId: item.entry_id,
      bundleId: entry?.kind === 'bundle' ? entry.id : null,
      chosenEntryId: item.chosen_entry_id,
      startsAtMinutes: start,
      endsAtMinutes: end,
    };
  });
}

/**
 * What the now bar says: what you are on, and what comes after it. Falls back to
 * a plain statement rather than an apology — a day with nothing on it is a day,
 * not a failure to plan.
 */
export function nowLine(rows: PlanRow[], opts: { day: string; now: Date }): NowLine {
  const nowIndex = rows.findIndex((row) => row.state === 'now');

  if (nowIndex >= 0) {
    const current = rows[nowIndex] as PlanRow;
    // "then" has to mean *after this*. Overlapping items are a plan somebody
    // made, not an error — but naming one of them as what follows produces
    // "Until 19:07 · then dinner at 18:30", a sentence that runs backwards. So
    // the next row is the first one that starts at or after this one ends, and
    // when nothing qualifies the bar simply says how long you have.
    const after = current.endsAtMinutes ?? current.startsAtMinutes ?? 0;
    const next = rows
      .slice(nowIndex + 1)
      .find((row) => row.startsAtMinutes !== null && row.startsAtMinutes >= after);
    const until = current.endsAtMinutes === null ? null : `Until ${formatMinutes(current.endsAtMinutes)}`;
    const then = next ? `then ${next.title} at ${formatMinutes(next.startsAtMinutes as number)}` : null;
    return { title: current.title, sub: joinMeta(until, then) };
  }

  // Off today's date the clock has no opinion, so every timed row is still
  // ahead of you; on today, only the ones the minute has not passed.
  const cutoff = isToday(opts.day, opts.now) ? minutesOfDay(opts.now) : -1;
  const next = rows.find((row) => row.startsAtMinutes !== null && row.startsAtMinutes > cutoff);
  if (next) {
    return {
      title: 'Nothing planned',
      sub: `Next: ${next.title} at ${formatMinutes(next.startsAtMinutes as number)}`,
    };
  }

  return { title: 'Nothing planned yet', sub: 'A loose day is fine' };
}
