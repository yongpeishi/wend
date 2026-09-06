/**
 * Pure helpers for the itinerary — the day list, the holes between placed
 * things, and the strings a day shows about itself. No React and no fetching,
 * so the whole shape of a day is unit-testable without rendering anything.
 */
import { formatMinutes } from '../../api/schedule';
import type { DayVersion, Entry, EntrySummary, ItineraryItem, TripDay } from '../../api/types';
import { formatDayTab, MIDDOT } from '../../lib/formatDates';
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

/** A kept entry as the rail lists it: the summary plus where it already sits. */
export interface PoolEntry extends EntrySummary {
  /** ISO dates of every LIVE-version day this entry sits on; ascending, deduped. [] = not placed. */
  placedOn: string[];
  /**
   * `placed · Day 1` (one day, found in `days`), `placed · 1 day` (one day
   * not in `days`), `placed · N days` (several). Null when `placedOn` is empty.
   */
  placedMarker: string | null;
}

/**
 * The rail's pool: every kept entry that could still go on a day, placed or
 * not. An idea placed on Day 1 stays listed so it can be placed on Day 2 too —
 * the API puts no uniqueness on schedule items per entry, and a lunch spot you
 * would happily eat at twice should not vanish after the first time. Placed
 * ones are marked and sink below the unplaced ones, but both groups keep the
 * order `kept` arrived in, so nothing jumps around as things are placed.
 *
 * Lodging is left out altogether: each day has its own lodging editor, and a
 * hotel sitting in the rail as if it were a thing to do at 14:00 is a wrong
 * answer to "where next?".
 *
 * Placement is read from `tripDays`, not `days`, so a day the trip no longer
 * covers (after shortening) still counts — the item is still saved there, and
 * saying "unplaced" about it would be a lie. Live versions only: an archived
 * version is a plan not chosen, and a thing on one of those is not on the day.
 * `days` serves only to name the day number in the marker; a date it cannot
 * name falls back to "1 day".
 */
export function buildPool(kept: EntrySummary[], tripDays: TripDay[], days: ItineraryDay[]): PoolEntry[] {
  const placedDays = new Map<number, Set<string>>();
  for (const tripDay of tripDays) {
    for (const version of tripDay.versions) {
      for (const item of version.schedule_items) {
        if (item.entry_id === null) continue;
        let dates = placedDays.get(item.entry_id);
        if (!dates) placedDays.set(item.entry_id, (dates = new Set()));
        dates.add(tripDay.day);
      }
    }
  }

  const numberByDay = new Map(days.map((day) => [day.day, day.number]));

  const pool = kept
    .filter((entry) => entry.category !== 'lodging')
    .map((entry): PoolEntry => {
      const placedOn = [...(placedDays.get(entry.id) ?? [])].sort();
      let placedMarker: string | null = null;
      if (placedOn.length === 1) {
        const number = numberByDay.get(placedOn[0] as string);
        placedMarker = `placed${MIDDOT}${number === undefined ? '1 day' : `Day ${number}`}`;
      } else if (placedOn.length > 1) {
        placedMarker = `placed${MIDDOT}${placedOn.length} days`;
      }
      return { ...entry, placedOn, placedMarker };
    });

  // Two passes rather than a sort: it keeps the within-group order by
  // construction instead of relying on the sort being stable.
  return [...pool.filter((entry) => entry.placedOn.length === 0), ...pool.filter((entry) => entry.placedOn.length > 0)];
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
 * one span, and its members have no rows of their own at all. But the design's
 * rule is that "a bundle member and a loose idea look identical"
 * (itinerary-decisions.md) — a member with an empty time column reads as an
 * indented orphan, not as one more thing on the day.
 *
 * So the band's span is divided between its members here, for display: in
 * `duration_minutes` proportion when every member has a usable one, evenly
 * otherwise; consecutive, non-overlapping slots; the last member lands exactly
 * on the bundle's end so rounding never leaves or steals a minute. The hours a
 * member shows therefore always add back up to the band above it.
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

/** Where the evening starts for suggestion purposes: 18:00. */
const EVENING_START_MINUTES = 18 * 60;

/** One clickable answer to "when?" — a concrete span and the reason it is offered. */
export interface SlotSuggestion {
  /** Minutes from midnight. */
  start: number;
  /** Always after `start`, and never past 23:59. */
  end: number;
  /** `fits this hole` | `right after <title>` | `morning` | `evening`. */
  label: string;
}

/**
 * The one-click answers the "when?" prompt offers for a thing just placed
 * untimed. Like `nextFreeSlot` these are suggestions, not rules — the time
 * editor stays one click away, and nothing here refuses a full day.
 *
 * The candidates, in the order they are offered:
 *
 * - Each hole the day already shows — the same holes `withGaps` finds, so the
 *   prompt never names a gap the list does not draw — but only when the thing
 *   actually fits in it whole. A chip that starts in a hole and spills onto
 *   the next plan would be advice to double-book.
 * - Right after the last placed thing, named after it, because "after the
 *   castle" is how people actually reason about the day. Dropped when it
 *   would run past 23:59 — minutes cannot say "tomorrow".
 * - The evening, when the day winds down before 18:00 and nothing above
 *   already starts then — a duplicate chip at the same minute would be two
 *   buttons for one choice.
 *
 * At most three come back: the prompt is a nudge, not a menu. Only timed items
 * count — an untimed thing has no edges to suggest around — and a day with no
 * timed items at all gets the one honest answer: the morning, at the same
 * 09:00 an empty day starts at everywhere else.
 */
export function suggestSlots(
  items: ItineraryItem[],
  durationMinutes: number | null,
): SlotSuggestion[] {
  const span = durationMinutes && durationMinutes > 0 ? durationMinutes : DEFAULT_SLOT_MINUTES;
  const timed = sorted(items).filter((item) => item.starts_at_minutes !== null);

  if (timed.length === 0) {
    return [
      {
        start: DEFAULT_START_MINUTES,
        end: Math.min(DEFAULT_START_MINUTES + span, LAST_MINUTE_OF_DAY),
        label: 'morning',
      },
    ];
  }

  const suggestions: SlotSuggestion[] = [];

  // The holes, read exactly the way withGaps reads them: measured from the
  // latest occupied minute so far, counted only at MIN_GAP_MINUTES or more,
  // never before the first thing or after the last. A hole earns a chip only
  // when the whole span fits inside it.
  let occupiedUntil: number | null = null;
  for (const item of timed) {
    const start = item.starts_at_minutes as number;
    if (occupiedUntil !== null) {
      const hole = start - occupiedUntil;
      if (hole >= MIN_GAP_MINUTES && hole >= span) {
        suggestions.push({ start: occupiedUntil, end: occupiedUntil + span, label: 'fits this hole' });
      }
    }
    // A timed item always has an occupied end — itemEnd falls back to the start.
    const end = itemEnd(item) as number;
    occupiedUntil = occupiedUntil === null ? end : Math.max(occupiedUntil, end);
  }

  // The thing the day ends on: the latest occupied end, and on a tie the item
  // placed later — position is the order the user built, so it is the one
  // they would call "the last thing".
  let lastEnd = -1;
  let lastItem: ItineraryItem | null = null;
  for (const item of timed) {
    const end = itemEnd(item) as number;
    if (end > lastEnd || (end === lastEnd && lastItem !== null && item.position > lastItem.position)) {
      lastEnd = end;
      lastItem = item;
    }
  }

  if (lastEnd + span <= LAST_MINUTE_OF_DAY) {
    const title = lastItem?.entry?.title;
    suggestions.push({
      start: lastEnd,
      end: lastEnd + span,
      label: title ? `right after ${title}` : 'right after the last thing',
    });
  }

  // The evening, when the plan winds down before it and no chip above already
  // starts there. The end clamps at 23:59 rather than dropping the chip — a
  // shortened evening is still an evening.
  if (
    lastEnd < EVENING_START_MINUTES &&
    !suggestions.some((slot) => slot.start === EVENING_START_MINUTES)
  ) {
    suggestions.push({
      start: EVENING_START_MINUTES,
      end: Math.min(EVENING_START_MINUTES + span, LAST_MINUTE_OF_DAY),
      label: 'evening',
    });
  }

  return suggestions.slice(0, 3);
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
