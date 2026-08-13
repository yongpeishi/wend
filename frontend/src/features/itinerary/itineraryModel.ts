/**
 * Pure helpers for the itinerary — the day list, the holes between placed
 * things, and the strings a day shows about itself. No React and no fetching,
 * so the whole shape of a day is unit-testable without rendering anything.
 */
import { formatMinutes } from '../../api/schedule';
import type { DayVersion, Entry, ItineraryItem, TripDay } from '../../api/types';
import { formatDayTab } from '../../lib/formatDates';
import { addDays } from '../schedule/scheduleModel';

/** An en-dash with no spaces around it — house style for ranges. */
const EN_DASH = '–';

/** A hole shorter than this is just the walk between two things, not a gap. */
export const MIN_GAP_MINUTES = 15;

/** Where a day starts when nothing is placed on it yet. */
const DEFAULT_START_MINUTES = 9 * 60;

/** How long a slot is when the thing being placed says nothing about itself. */
const DEFAULT_SLOT_MINUTES = 60;

/** 23:59. Minutes are 0..1439 (see ScheduleItem), so a slot can never spill past it. */
const LAST_MINUTE_OF_DAY = 24 * 60 - 1;

/**
 * The id an implicit version carries — a day the trip covers but nothing has
 * ever been saved for. The server has no row for it yet, so there is no real
 * id to use. Anything placed on such a day is posted without a
 * `day_version_id`, which the API resolves to "the day's first live version,
 * created if it has none" (contract §2). Never send this id anywhere.
 */
export const UNSAVED_VERSION_ID = 0;

/** One row of an open day: a placed thing, or the hole before the next one. */
export type Row =
  | { kind: 'item'; item: ItineraryItem }
  | { kind: 'gap'; startsAtMinutes: number; endsAtMinutes: number };

/**
 * One date of the trip as the screen draws it: the trip's own calendar merged
 * with whatever the itinerary endpoint returned. Every date in range appears,
 * including the ones nothing has been placed on — an empty day is a legitimate
 * day, never an error (see itinerary-decisions.md, "Long trips").
 */
export interface ItineraryDay {
  /** ISO `YYYY-MM-DD`. */
  day: string;
  /** 1-based position in the trip, which is what "Day 3" counts. */
  number: number;
  /** `Day 3 · Tue 14`. */
  label: string;
  /** The saved row, or null when this date has never been written to. */
  tripDay: TripDay | null;
  /** Live versions, in position order. Always at least one — implicit if unsaved. */
  versions: DayVersion[];
  /** Kept-but-not-chosen versions, most recently archived first. */
  archivedVersions: DayVersion[];
  /** What the server resolved the lodging to: entry title, else free text, else null. */
  lodgingTitle: string | null;
  lodgingEntryId: number | null;
  lodgingLabel: string | null;
}

/** The stand-in version an untouched date shows until something is placed on it. */
function implicitVersion(): DayVersion {
  return {
    id: UNSAVED_VERSION_ID,
    trip_day_id: UNSAVED_VERSION_ID,
    name: 'Version A',
    position: 0,
    archived_at: null,
    schedule_items: [],
  };
}

/**
 * The trip's dates crossed with the days the server knows about. Returns an
 * empty list when the trip has no dates — that is the dates gate's cue, and it
 * is a normal state rather than a fault.
 *
 * The 366 guard mirrors `daysForTrip`: a typo in `ends_on` should not hang the
 * browser building a list of ten thousand days.
 */
export function buildDayList(
  trip: Pick<Entry, 'starts_on' | 'ends_on'>,
  tripDays: TripDay[],
): ItineraryDay[] {
  if (!trip.starts_on || !trip.ends_on) return [];

  const byDay = new Map(tripDays.map((tripDay) => [tripDay.day, tripDay]));
  const days: ItineraryDay[] = [];
  let cursor = trip.starts_on;

  while (cursor <= trip.ends_on && days.length < 366) {
    const tripDay = byDay.get(cursor) ?? null;
    const versions = tripDay && tripDay.versions.length > 0 ? tripDay.versions : [implicitVersion()];
    days.push({
      day: cursor,
      number: days.length + 1,
      label: `Day ${days.length + 1} · ${formatDayTab(cursor)}`,
      tripDay,
      versions,
      archivedVersions: tripDay?.archived_versions ?? [],
      lodgingTitle: tripDay?.lodging_title ?? null,
      lodgingEntryId: tripDay?.lodging_entry_id ?? null,
      lodgingLabel: tripDay?.lodging_label ?? null,
    });
    cursor = addDays(cursor, 1);
  }

  return days;
}

/**
 * Timed items first in clock order, untimed ones after — the same rule the
 * serializer uses. The list arrives ordered, so this only defends against
 * locally-built optimistic data.
 */
function sorted(items: ItineraryItem[]): ItineraryItem[] {
  return [...items].sort((a, b) => {
    if (a.starts_at_minutes === null && b.starts_at_minutes === null) return a.position - b.position;
    if (a.starts_at_minutes === null) return 1;
    if (b.starts_at_minutes === null) return -1;
    return a.starts_at_minutes - b.starts_at_minutes || a.position - b.position;
  });
}

/** Where an item's occupied time ends: its end, or its start when it has no end. */
function itemEnd(item: ItineraryItem): number | null {
  if (item.ends_at_minutes !== null) return item.ends_at_minutes;
  return item.starts_at_minutes;
}

/**
 * The day's rows with its holes made explicit. Gaps sit strictly BETWEEN two
 * placed things: never before the first and never after the last, because the
 * morning before you start and the evening after you stop are not gaps in a
 * plan, they are the edges of it.
 *
 * A hole counts only at `MIN_GAP_MINUTES` or more — below that it is the walk
 * between two things. Overlapping items produce no gap at all: there is no
 * hole to fill, and overlap detection is deliberately out of scope (contract
 * §6), so an overlap is simply left alone rather than flagged.
 *
 * Untimed items pass straight through as rows; nothing can be said about the
 * hole either side of a thing with no hours yet.
 */
export function withGaps(items: ItineraryItem[]): Row[] {
  const rows: Row[] = [];
  /** The latest minute anything before this point occupies. */
  let occupiedUntil: number | null = null;

  for (const item of sorted(items)) {
    const start = item.starts_at_minutes;
    if (start !== null && occupiedUntil !== null && start - occupiedUntil >= MIN_GAP_MINUTES) {
      rows.push({ kind: 'gap', startsAtMinutes: occupiedUntil, endsAtMinutes: start });
    }
    rows.push({ kind: 'item', item });

    const end = itemEnd(item);
    if (end !== null) occupiedUntil = occupiedUntil === null ? end : Math.max(occupiedUntil, end);
  }

  return rows;
}

/**
 * `4 hr 15`, `45 min`. Deliberately not `lib/formatDates.formatDuration`,
 * which spells the trailing minutes as "1 hr 30 min": on the itinerary a
 * duration always sits beside a time range, and the mockup's shorter form
 * ("Nothing planned · 4 hr 15") is what keeps a gap row to one line.
 *
 * This is the itinerary's only duration format. The rail, the picker and the
 * bundle members read it too, because two conventions on one screen — a gap
 * saying "1 hr 20" a hand's width from a rail saying "1 hr 30 min" — reads as
 * two different measurements rather than one. The other screens keep
 * `lib/formatDates`, where the longer form is at home.
 *
 * Null takes an empty string rather than null, so it drops out of `joinMeta`
 * exactly as the nullable version does.
 */
export function formatDuration(mins: number | null): string {
  if (mins === null) return '';
  if (mins < 60) return `${Math.max(0, mins)} min`;
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes}`;
}

/** One member's share of its bundle's span. Both null when the bundle is untimed. */
export interface DerivedSpan {
  startsAtMinutes: number | null;
  endsAtMinutes: number | null;
}

/**
 * The hours each member of a placed bundle would get, DERIVED FOR DISPLAY ONLY.
 *
 * Nothing here is stored: a bundle sits on a day as one `schedule_item` with
 * one span, and its members have no rows of their own until you ungroup. But
 * the design's rule is that "a bundle member and a loose idea look identical"
 * (itinerary-decisions.md) — a member with an empty time column reads as an
 * indented orphan, not as one more thing on the day.
 *
 * So these are computed with **exactly** the rule the server's `ungroup` uses
 * (`ScheduleItem#split_slots`, contract §2): divide the span in
 * `duration_minutes` proportion when every member has a usable one, evenly
 * otherwise; consecutive, non-overlapping slots; the last member lands exactly
 * on the bundle's end so rounding never leaves or steals a minute. Which means
 * what a member shows here is precisely what it is given if you ungroup it —
 * the display never promises hours the server would not hand out.
 *
 * Keep this in step with `backend/app/models/schedule_item.rb` if that rule
 * ever changes.
 */
export function bundleMemberSpans(
  item: Pick<ItineraryItem, 'starts_at_minutes' | 'ends_at_minutes' | 'members'>,
): DerivedSpan[] {
  const { members } = item;
  const start = item.starts_at_minutes;
  const end = item.ends_at_minutes;

  // An untimed bundle hands its members no times either.
  if (start === null || end === null) return members.map(() => ({ startsAtMinutes: null, endsAtMinutes: null }));

  const span = end - start;
  const estimates = members.map((member) => member.duration_minutes);
  const proportional = estimates.every((minutes): minutes is number => minutes !== null && minutes > 0);
  const weights = proportional ? estimates : members.map(() => 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let cursor = start;
  let running = 0;
  return members.map((_member, index) => {
    running += weights[index];
    // The last member always lands exactly on the end, so rounding never
    // leaves or steals a minute.
    const raw = index === members.length - 1 ? end : start + Math.round((span * running) / total);
    const finish = Math.min(Math.max(raw, cursor), end);
    const slot = { startsAtMinutes: cursor, endsAtMinutes: finish };
    cursor = finish;
    return slot;
  });
}

/** `08:00–12:30`, or just the start when a thing has no end yet. Empty when untimed. */
export function formatSpan(start: number | null, end: number | null): string {
  if (start === null) return '';
  if (end === null) return formatMinutes(start);
  return `${formatMinutes(start)}${EN_DASH}${formatMinutes(end)}`;
}

/**
 * How much of the day is spoken for — the placed hours added up, not the span
 * from first to last, so the gaps between them are not counted as plans.
 * Empty string when nothing on the day carries hours yet.
 */
export function dayHours(items: ItineraryItem[]): string {
  const total = items.reduce((sum, item) => {
    if (item.starts_at_minutes === null || item.ends_at_minutes === null) return sum;
    return sum + Math.max(0, item.ends_at_minutes - item.starts_at_minutes);
  }, 0);
  return total === 0 ? '' : formatDuration(total);
}

/**
 * The hours a whole version covers, first start to last end — `09:00–18:30`.
 *
 * Not the same fact as `dayHours`: this is the outside edge of the plan
 * including the holes in it, which is what answers "when did that version have
 * me out?". Empty when nothing in it carries hours.
 */
export function versionSpan(items: ItineraryItem[]): string {
  let first: number | null = null;
  let last: number | null = null;

  for (const item of items) {
    if (item.starts_at_minutes === null) continue;
    first = first === null ? item.starts_at_minutes : Math.min(first, item.starts_at_minutes);
    const end = itemEnd(item);
    if (end !== null) last = last === null ? end : Math.max(last, end);
  }

  if (first === null) return '';
  return formatSpan(first, last === null || last === first ? null : last);
}

/** The collapsed row's middle cell: what is on the day, in order, clipped by CSS. */
export function daySummary(items: ItineraryItem[]): string {
  return sorted(items)
    .map((item) => item.entry?.title)
    .filter((title): title is string => Boolean(title))
    .join(' · ');
}

/**
 * Where the next thing lands: after everything already placed, else 09:00.
 * It is a suggestion, not a rule — the time editor is one click away, and
 * nothing here refuses to place something because the day is full.
 */
export function nextFreeSlot(
  items: ItineraryItem[],
  durationMinutes: number | null,
): { start: number; end: number } {
  const lastEnd = items.reduce<number | null>((latest, item) => {
    const end = itemEnd(item);
    if (end === null) return latest;
    return latest === null ? end : Math.max(latest, end);
  }, null);

  const span = durationMinutes && durationMinutes > 0 ? durationMinutes : DEFAULT_SLOT_MINUTES;
  let start = lastEnd ?? DEFAULT_START_MINUTES;
  if (start + span > LAST_MINUTE_OF_DAY) start = Math.max(0, LAST_MINUTE_OF_DAY - span);
  return { start, end: Math.min(LAST_MINUTE_OF_DAY, start + span) };
}
