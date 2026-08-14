// A tiny in-memory backend used by the MSW handlers. Dev/test only — mirrors
// architecture.md §2-4 closely enough for the app and its tests to run without
// the Rails API. Not meant to be a faithful reimplementation of every rule
// (e.g. cycle detection on links is not enforced here).
import type {
  DayVersion,
  Entry,
  EntryDetailResponse,
  EntryLink,
  EntryNote,
  EntrySummary,
  Feedback,
  ItineraryItem,
  ScheduleItem,
  Todo,
  TripDay,
  User,
  Vote,
  VoteTally,
} from '../api/types';

interface StoredUser extends User {
  password: string;
}

export interface StoredEntry {
  id: number;
  kind: Entry['kind'];
  title: string;
  description: string | null;
  category: Entry['category'];
  starts_on: string | null;
  ends_on: string | null;
  location_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  duration_minutes: number | null;
  source_url: string | null;
  notes: string | null;
  from_entry_id: number | null;
  to_entry_id: number | null;
  pros: EntryNote[];
  cons: EntryNote[];
  created_by_id: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The `trip_days` row — see CONTRACT §1. `lodging_title` is derived, not stored. */
export interface StoredTripDay {
  id: number;
  trip_id: number;
  day: string;
  lodging_entry_id: number | null;
  lodging_label: string | null;
  created_at: string;
  updated_at: string;
}

/** The `day_versions` row. `archived_at` set = kept aside, not chosen. */
export interface StoredDayVersion {
  id: number;
  trip_day_id: number;
  name: string;
  position: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

let nextId = 1000;
export function allocateId(): number {
  return nextId++;
}

export const db = {
  users: [] as StoredUser[],
  entries: [] as StoredEntry[],
  links: [] as EntryLink[],
  votes: [] as Vote[],
  todos: [] as Todo[],
  scheduleItems: [] as ScheduleItem[],
  tripDays: [] as StoredTripDay[],
  dayVersions: [] as StoredDayVersion[],
  feedbacks: [] as Feedback[],
  currentUserId: null as number | null,
};

export function now(): string {
  return new Date().toISOString();
}

export function findEntry(id: number): StoredEntry | undefined {
  return db.entries.find((e) => e.id === id);
}

export function childIdsOf(parentId: number): number[] {
  return db.links
    .filter((l) => l.parent_id === parentId)
    .sort((a, b) => a.position - b.position)
    .map((l) => l.child_id);
}

export function parentIdsOf(childId: number): number[] {
  return db.links.filter((l) => l.child_id === childId).map((l) => l.parent_id);
}

/** Walk ancestors to find whether `id` sits (at any depth) under a kind:"trip" entry. */
export function tripAncestorId(id: number): number | null {
  const visited = new Set<number>();
  const queue = [...parentIdsOf(id)];
  while (queue.length) {
    const parentId = queue.shift();
    if (parentId === undefined || visited.has(parentId)) continue;
    visited.add(parentId);
    const parent = findEntry(parentId);
    if (parent?.kind === 'trip') return parent.id;
    queue.push(...parentIdsOf(parentId));
  }
  return null;
}

export function voteTallyFor(entryId: number): VoteTally {
  const votes = db.votes.filter((v) => v.entry_id === entryId);
  const total = votes.reduce((sum, v) => sum + v.score, 0);
  const by_user: Record<string, number> = {};
  for (const v of votes) by_user[String(v.user_id)] = v.score;
  return {
    total,
    count: votes.length,
    average: votes.length ? Number((total / votes.length).toFixed(2)) : 0,
    by_user,
  };
}

/** Mirrors the server's `ScheduleItem.placed`: an entry is scheduled once a
 * LIVE version holds it. A placement left behind in an archived version is a
 * plan the user rejected, so the entry is free again — the same answer the
 * itinerary screen computes for its unplaced rail. */
export function isScheduled(entryId: number): boolean {
  return db.scheduleItems.some((s) => (s.entry_id === entryId || s.chosen_entry_id === entryId) && isPlaced(s));
}

export function toEntrySummary(entry: StoredEntry): EntrySummary {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    category: entry.category,
    duration_minutes: entry.duration_minutes,
    location_name: entry.location_name,
  };
}

export function toEntry(entry: StoredEntry, currentUserId: number | null): Entry {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    description: entry.description,
    category: entry.category,
    starts_on: entry.starts_on,
    ends_on: entry.ends_on,
    location_name: entry.location_name,
    address: entry.address,
    lat: entry.lat,
    lng: entry.lng,
    duration_minutes: entry.duration_minutes,
    source_url: entry.source_url,
    notes: entry.notes,
    from_entry_id: entry.from_entry_id,
    to_entry_id: entry.to_entry_id,
    // Copied, not aliased: handing the stored arrays straight to a caller would
    // let the UI mutate the "server" in place and hide a missing PATCH.
    pros: entry.pros.map((n) => ({ ...n })),
    cons: entry.cons.map((n) => ({ ...n })),
    archived_at: entry.archived_at,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    children_count: childIdsOf(entry.id).length,
    todos_open_count: db.todos.filter((t) => t.entry_id === entry.id && !t.done_at).length,
    vote_tally: voteTallyFor(entry.id),
    my_vote: currentUserId !== null ? (db.votes.find((v) => v.entry_id === entry.id && v.user_id === currentUserId)?.score ?? null) : null,
    scheduled: isScheduled(entry.id),
  };
}

/** { entry, parents, children, todos, votes } — siblings, not merged into `entry`.
 * See EntryDetailResponse in api/types.ts for why. */
export function toEntryDetail(entry: StoredEntry, currentUserId: number | null): EntryDetailResponse {
  return {
    entry: toEntry(entry, currentUserId),
    parents: parentIdsOf(entry.id)
      .map((id) => findEntry(id))
      .filter((e): e is StoredEntry => Boolean(e))
      .map(toEntrySummary),
    children: childIdsOf(entry.id)
      .map((id) => findEntry(id))
      .filter((e): e is StoredEntry => Boolean(e))
      .map((e) => toEntry(e, currentUserId)),
    todos: db.todos.filter((t) => t.entry_id === entry.id),
    votes: db.votes.filter((v) => v.entry_id === entry.id),
  };
}

// ---- Itinerary ------------------------------------------------------------
// trip_days -> day_versions -> schedule_items. The rules here mirror
// CONTRACT §1 "Model rules" and §2 "API surface" closely enough that the UI
// can be driven against them: never hard-delete a version, a day always keeps
// at least one live version, and version letters run A -> B -> C.

/** "Version A" … "Version Z", then "Version AA" — index 0 is A. */
export function versionName(index: number): string {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Version ${letters}`;
}

export function findTripDay(tripId: number, day: string): StoredTripDay | undefined {
  return db.tripDays.find((d) => d.trip_id === tripId && d.day === day);
}

export function findDayVersion(id: number): StoredDayVersion | undefined {
  return db.dayVersions.find((v) => v.id === id);
}

export function versionsOf(tripDayId: number): StoredDayVersion[] {
  return db.dayVersions.filter((v) => v.trip_day_id === tripDayId);
}

export function liveVersionsOf(tripDayId: number): StoredDayVersion[] {
  return versionsOf(tripDayId)
    .filter((v) => !v.archived_at)
    .sort((a, b) => a.position - b.position || a.id - b.id);
}

export function archivedVersionsOf(tripDayId: number): StoredDayVersion[] {
  return versionsOf(tripDayId)
    .filter((v) => v.archived_at)
    .sort((a, b) => (b.archived_at ?? '').localeCompare(a.archived_at ?? '') || b.id - a.id);
}

/** Fork naming: the next letter by count of every version the day has ever had. */
export function nextForkName(tripDayId: number): string {
  return versionName(versionsOf(tripDayId).length);
}

/** Restore naming: the first letter no *live* version is using. */
export function nextFreeName(tripDayId: number): string {
  const taken = new Set(liveVersionsOf(tripDayId).map((v) => v.name));
  for (let i = 0; ; i += 1) {
    const name = versionName(i);
    if (!taken.has(name)) return name;
  }
}

export function addDayVersion(tripDayId: number, name: string, position: number, id = allocateId()): StoredDayVersion {
  const version: StoredDayVersion = {
    id,
    trip_day_id: tripDayId,
    name,
    position,
    archived_at: null,
    created_at: now(),
    updated_at: now(),
  };
  db.dayVersions.push(version);
  return version;
}

/** The day's row, created with a "Version A" if this date had none — §2's auto-create. */
export function ensureTripDay(tripId: number, day: string): StoredTripDay {
  const existing = findTripDay(tripId, day);
  if (existing) {
    if (liveVersionsOf(existing.id).length === 0) addDayVersion(existing.id, nextFreeName(existing.id), 0);
    return existing;
  }
  const tripDay: StoredTripDay = {
    id: allocateId(),
    trip_id: tripId,
    day,
    lodging_entry_id: null,
    lodging_label: null,
    created_at: now(),
    updated_at: now(),
  };
  db.tripDays.push(tripDay);
  addDayVersion(tripDay.id, versionName(0), 0);
  return tripDay;
}

/** Where a schedule item lands when the caller names no version — §2's fallback. */
export function firstLiveVersionId(tripId: number, day: string): number {
  const tripDay = ensureTripDay(tripId, day);
  return liveVersionsOf(tripDay.id)[0]?.id ?? addDayVersion(tripDay.id, nextFreeName(tripDay.id), 0).id;
}

// Two questions get asked of schedule_items, and answering both with "every
// item on the day" is the bug these mirror the server to stop. Neither ever
// counts an ARCHIVED version — a plan the user explicitly rejected must not
// come back on any screen. A null day_version_id is in both: those rows predate
// day_versions and must not vanish. See ScheduleItem.in_final_plan / .placed.

/** "What is the plan for this day?" — one plan, the day's first live version.
 * What GET /api/trips/:id/schedule (the Final schedule screen) reads. */
export function inFinalPlan(item: ScheduleItem): boolean {
  if (item.day_version_id === null) return true;
  const version = findDayVersion(item.day_version_id);
  if (!version || version.archived_at) return false;
  return liveVersionsOf(version.trip_day_id)[0]?.id === version.id;
}

/** "Has this been placed anywhere yet?" — any live version counts, so a fork
 * under comparison keeps both alternatives off the unplaced rail. */
export function isPlaced(item: ScheduleItem): boolean {
  if (item.day_version_id === null) return true;
  const version = findDayVersion(item.day_version_id);
  return version !== undefined && version.archived_at === null;
}

/** Null times sort last, so an untimed item never jumps to the top of a day. */
function startRank(minutes: number | null): number {
  return minutes === null ? Number.MAX_SAFE_INTEGER : minutes;
}

export function itemsOfVersion(versionId: number): ScheduleItem[] {
  return db.scheduleItems
    .filter((s) => s.day_version_id === versionId)
    .sort((a, b) => startRank(a.starts_at_minutes) - startRank(b.starts_at_minutes) || a.position - b.position);
}

export function toItineraryItem(item: ScheduleItem): ItineraryItem {
  const entry = item.entry_id !== null ? findEntry(item.entry_id) : undefined;
  return {
    ...item,
    entry: entry ? toEntrySummary(entry) : null,
    members:
      entry?.kind === 'bundle'
        ? childIdsOf(entry.id)
            .map((id) => findEntry(id))
            .filter((e): e is StoredEntry => Boolean(e))
            .map(toEntrySummary)
        : [],
  };
}

export function toDayVersion(version: StoredDayVersion): DayVersion {
  return {
    id: version.id,
    trip_day_id: version.trip_day_id,
    name: version.name,
    position: version.position,
    archived_at: version.archived_at,
    schedule_items: itemsOfVersion(version.id).map(toItineraryItem),
  };
}

export function toTripDay(tripDay: StoredTripDay): TripDay {
  const lodgingEntry = tripDay.lodging_entry_id !== null ? findEntry(tripDay.lodging_entry_id) : undefined;
  return {
    id: tripDay.id,
    trip_id: tripDay.trip_id,
    day: tripDay.day,
    lodging_entry_id: tripDay.lodging_entry_id,
    lodging_label: tripDay.lodging_label,
    // The entry's title wins when there is one; free text is the fallback.
    lodging_title: lodgingEntry?.title ?? tripDay.lodging_label ?? null,
    versions: liveVersionsOf(tripDay.id).map(toDayVersion),
    archived_versions: archivedVersionsOf(tripDay.id).map(toDayVersion),
  };
}

// ---- Moving a trip's dates -------------------------------------------------
// Mirrors backend/app/models/trip_date_shift.rb. Placement is keyed by a real
// date, but "Day 2" is what was planned — an offset from the trip's start — so
// moving the start moves every trip_day and every schedule_item by the same
// delta. A day that ends up outside the new range is DROPPED: its placements
// go, the entries they pointed at do not, so those ideas fall back onto the
// unplaced rail.

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-11-02` + 3 -> `2026-11-05`. UTC throughout, so no zone shifts a day. */
export function shiftIso(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, signed. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** What a PATCH of these attributes would do to everything planned on the trip. */
export interface TripDateShift {
  tripId: number;
  shiftDays: number;
  /** Post-shift dates that fall outside the new range, ascending. */
  droppedDays: string[];
  droppedItemCount: number;
}

/**
 * Build the shift, without applying any of it.
 *
 * A write that names neither date is a no-op — renaming a trip must never drop
 * a day, even one that was already out of range — which is why this reads the
 * keys' presence rather than their values.
 */
export function tripDateShiftFor(trip: StoredEntry, attrs: Partial<StoredEntry>): TripDateShift {
  const namesStart = 'starts_on' in attrs;
  const namesEnd = 'ends_on' in attrs;
  if (!namesStart && !namesEnd) {
    return { tripId: trip.id, shiftDays: 0, droppedDays: [], droppedItemCount: 0 };
  }

  const startsOn = namesStart ? (attrs.starts_on ?? null) : trip.starts_on;
  const endsOn = namesEnd ? (attrs.ends_on ?? null) : trip.ends_on;
  // No previous start means there was no "Day 2" to preserve, so nothing moves.
  const shiftDays = startsOn && trip.starts_on ? daysBetween(trip.starts_on, startsOn) : 0;

  // Both tables, not just trip_days: a placement can sit on a date that never
  // got a trip_day row of its own, and it must travel with the rest.
  const planned = new Set<string>([
    ...db.tripDays.filter((d) => d.trip_id === trip.id).map((d) => d.day),
    ...db.scheduleItems.filter((s) => s.trip_id === trip.id).map((s) => s.day),
  ]);

  const inRange = (day: string) => !(startsOn && day < startsOn) && !(endsOn && day > endsOn);
  const droppedDays = [...planned]
    .map((day) => shiftIso(day, shiftDays))
    .filter((day) => !inRange(day))
    .sort();

  const before = new Set(droppedDays.map((day) => shiftIso(day, -shiftDays)));
  const droppedItemCount = db.scheduleItems.filter((s) => s.trip_id === trip.id && before.has(s.day)).length;

  return { tripId: trip.id, shiftDays, droppedDays, droppedItemCount };
}

/** Move the plan, then clear whatever ended up off the end. */
export function applyTripDateShift(shift: TripDateShift) {
  const { tripId, shiftDays, droppedDays } = shift;
  if (shiftDays === 0 && droppedDays.length === 0) return;

  if (shiftDays !== 0) {
    for (const tripDay of db.tripDays.filter((d) => d.trip_id === tripId)) {
      tripDay.day = shiftIso(tripDay.day, shiftDays);
      tripDay.updated_at = now();
    }
    for (const item of db.scheduleItems.filter((s) => s.trip_id === tripId)) {
      item.day = shiftIso(item.day, shiftDays);
    }
  }

  if (droppedDays.length === 0) return;
  const dropped = new Set(droppedDays);
  // Placements only. The Entry each one pointed at is untouched, which is what
  // puts those ideas back under "Not placed yet" rather than losing them.
  db.scheduleItems = db.scheduleItems.filter((s) => !(s.trip_id === tripId && dropped.has(s.day)));
  const goneDayIds = new Set(db.tripDays.filter((d) => d.trip_id === tripId && dropped.has(d.day)).map((d) => d.id));
  db.tripDays = db.tripDays.filter((d) => !goneDayIds.has(d.id));
  db.dayVersions = db.dayVersions.filter((v) => !goneDayIds.has(v.trip_day_id));
}

/**
 * Exchange two dates of a trip — mirrors `TripDay.swap_days!`. Everything the
 * date owns travels: the row (so lodging and every version go with it) and the
 * `day` of each schedule item on it. Either date may be empty, which is how
 * swapping a planned day with an empty one just moves the plan.
 */
export function swapTripDays(tripId: number, a: string, b: string) {
  if (a === b) return;
  const rowA = findTripDay(tripId, a);
  const rowB = findTripDay(tripId, b);
  // Both sides read before either is written, or the first write swallows the second.
  const itemsA = db.scheduleItems.filter((s) => s.trip_id === tripId && s.day === a);
  const itemsB = db.scheduleItems.filter((s) => s.trip_id === tripId && s.day === b);

  if (rowA) {
    rowA.day = b;
    rowA.updated_at = now();
  }
  if (rowB) {
    rowB.day = a;
    rowB.updated_at = now();
  }
  itemsA.forEach((item) => {
    item.day = b;
  });
  itemsB.forEach((item) => {
    item.day = a;
  });
}

function addLink(parentId: number, childId: number, position: number) {
  db.links.push({ id: allocateId(), parent_id: parentId, child_id: childId, position, created_at: now(), updated_at: now() });
}

export function seed() {
  db.users = [{ id: 1, name: 'Demo Traveler', email: 'demo@wend.app', password: 'password' }];
  db.currentUserId = null;
  // Links are rebuilt from scratch below. Without this the seeded links were
  // appended again on every resetDb(), so children_count crept up between
  // tests and one test's links leaked into the next.
  db.links = [];

  const trip: StoredEntry = {
    id: 1,
    kind: 'trip',
    title: 'Six days in Kyoto',
    description: 'Temples, rivers, and slow mornings.',
    category: null,
    starts_on: '2026-11-02',
    ends_on: '2026-11-08',
    location_name: null,
    address: null,
    lat: null,
    lng: null,
    duration_minutes: null,
    source_url: null,
    notes: null,
    from_entry_id: null,
    to_entry_id: null,
    // A trip that already carries one of each, so the pros/cons control on `/`
    // has something to remove as well as something to add.
    pros: [{ id: 'seed-pro-1', text: 'Flights are already booked' }],
    cons: [{ id: 'seed-con-1', text: 'Nothing sorted yet' }],
    created_by_id: 1,
    archived_at: null,
    created_at: now(),
    updated_at: now(),
  };

  const nanzenji: StoredEntry = {
    ...trip,
    id: 2,
    kind: 'idea',
    title: 'Nanzen-ji',
    description: null,
    // Fresh arrays: spreading `trip` would alias its notes into every entry.
    pros: [],
    cons: [],
    category: 'place',
    starts_on: null,
    ends_on: null,
    location_name: 'Nanzen-ji',
    address: 'Kyoto, Sakyo Ward',
    lat: 35.0116,
    lng: 135.7681,
    duration_minutes: 40,
  };

  const kiyamachi: StoredEntry = {
    ...trip,
    id: 3,
    kind: 'idea',
    title: 'Kiyamachi',
    description: null,
    pros: [],
    cons: [],
    category: 'activity',
    location_name: 'Kiyamachi-dori',
    address: 'Kyoto',
    lat: 35.0086,
    lng: 135.7717,
    duration_minutes: 90,
  };

  const marketBundle: StoredEntry = {
    ...trip,
    id: 4,
    kind: 'bundle',
    title: 'Nishiki market crawl',
    description: null,
    category: null,
    pros: [],
    cons: [],
  };

  /** Ideas hang under a bundle, never straight off the trip: the trip's three
   * direct children are its shape on the trips list, and the itinerary's extra
   * material is grouped material. Deliberately no lat/lng — the map counts
   * located ideas, and these are things to do, not places to pin. */
  const idea = (
    id: number,
    title: string,
    category: Entry['category'],
    durationMinutes: number,
    locationName: string,
  ): StoredEntry => ({
    ...trip,
    id,
    kind: 'idea',
    title,
    description: null,
    pros: [],
    cons: [],
    category,
    starts_on: null,
    ends_on: null,
    location_name: locationName,
    address: null,
    lat: null,
    lng: null,
    duration_minutes: durationMinutes,
  });

  // 30 + 60 + 30 = the bundle's two-hour span exactly, so the members' derived
  // hours come out as whole, obviously-proportional slots.
  const coffee = idea(6, 'Coffee at Weekenders', 'food', 30, 'Weekenders Coffee');
  const nishiki = idea(7, 'Nishiki market', 'food', 60, 'Nishiki-koji');
  const teramachi = idea(8, 'Teramachi arcade', 'activity', 30, 'Teramachi');

  const nightBundle: StoredEntry = {
    ...trip,
    id: 9,
    kind: 'bundle',
    title: 'A night out in Pontocho',
    description: null,
    category: null,
    pros: [],
    cons: [],
  };

  const kamogawa = idea(10, 'Kamo river walk', 'activity', 45, 'Kamogawa');
  const yakitori = idea(11, 'Yakitori under the tracks', 'food', 45, 'Kiyamachi-dori');

  const library1: StoredEntry = {
    ...trip,
    id: 5,
    kind: 'idea',
    title: 'Fushimi Inari at dawn',
    description: 'Saved from a friend’s trip report.',
    pros: [],
    cons: [],
    category: 'place',
    location_name: 'Fushimi Inari Taisha',
    lat: 34.9671,
    lng: 135.7727,
    source_url: 'https://example.com/fushimi-inari',
  };

  db.entries = [trip, nanzenji, kiyamachi, marketBundle, library1, coffee, nishiki, teramachi, nightBundle, kamogawa, yakitori];

  addLink(trip.id, nanzenji.id, 0);
  addLink(trip.id, marketBundle.id, 1);
  addLink(trip.id, nightBundle.id, 2);

  addLink(marketBundle.id, coffee.id, 0);
  addLink(marketBundle.id, nishiki.id, 1);
  addLink(marketBundle.id, teramachi.id, 2);

  // 90 + 45 + 45 = the night bundle's three-hour span.
  addLink(nightBundle.id, kiyamachi.id, 0);
  addLink(nightBundle.id, kamogawa.id, 1);
  addLink(nightBundle.id, yakitori.id, 2);

  db.votes = [
    { id: allocateId(), entry_id: nanzenji.id, user_id: 1, user_name: 'Priya', score: 2 },
    { id: allocateId(), entry_id: kiyamachi.id, user_id: 1, user_name: 'Priya', score: 1 },
    // A second voice, so the per-user breakdown in the drawer has something
    // to show — multi-user voting is the point of the feature.
    { id: allocateId(), entry_id: nanzenji.id, user_id: 2, user_name: 'Sam', score: -1 },
  ];

  db.todos = [
    { id: allocateId(), title: 'Check opening hours', entry_id: nanzenji.id, trip_id: null, done_at: null, due_on: null, position: 0 },
    { id: allocateId(), title: 'Apply for visa', entry_id: null, trip_id: trip.id, done_at: null, due_on: '2026-10-01', position: 0 },
  ];

  // Starts empty: feedback is something the user produces, never seed content.
  db.feedbacks = [];

  // ---- Itinerary ---------------------------------------------------------
  // Three of the trip's seven dates carry a row; the rest are untouched days,
  // which is what the screen looks like mid-planning. Between them they cover
  // every shape the UI has to draw: a bundle and a loose idea with a real gap
  // between them, two live versions side by side, an archived version, a day
  // with lodging and a day without. Kiyamachi, Nishiki market and the coffee
  // are in no live version, so the unplaced rail has three things in it.
  // Fixed ids (days 1-3, versions 1-5) so a dev poking at /api/day_versions/2
  // gets the same version every reload; everything minted later uses allocateId().
  const day1 = { id: 1, trip_id: trip.id, day: '2026-11-02', lodging_entry_id: null, lodging_label: 'Machiya near Gion', created_at: now(), updated_at: now() };
  const day2 = { id: 2, trip_id: trip.id, day: '2026-11-03', lodging_entry_id: null, lodging_label: null, created_at: now(), updated_at: now() };
  const day3 = { id: 3, trip_id: trip.id, day: '2026-11-04', lodging_entry_id: null, lodging_label: 'Sleeping on the night train', created_at: now(), updated_at: now() };
  db.tripDays = [day1, day2, day3];

  const version = (id: number, tripDayId: number, name: string, position: number, archivedAt: string | null = null) => ({
    id,
    trip_day_id: tripDayId,
    name,
    position,
    archived_at: archivedAt,
    created_at: now(),
    updated_at: now(),
  });

  db.dayVersions = [
    version(1, day1.id, 'Version A', 0),
    // The undecided day: two ways to spend it, neither settled.
    version(2, day2.id, 'Version A', 0),
    version(3, day2.id, 'Version B', 1),
    version(4, day3.id, 'Version A', 0),
    // Kept aside rather than deleted — the archived panel's content.
    version(5, day3.id, 'Version B', 1, '2026-10-20T09:00:00.000Z'),
  ];

  const item = (
    versionId: number,
    day: string,
    entryId: number,
    startsAtMinutes: number,
    endsAtMinutes: number,
    position: number,
  ): ScheduleItem => ({
    id: allocateId(),
    trip_id: trip.id,
    entry_id: entryId,
    chosen_entry_id: null,
    day,
    day_version_id: versionId,
    starts_at_minutes: startsAtMinutes,
    ends_at_minutes: endsAtMinutes,
    note: null,
    position,
  });

  db.scheduleItems = [
    // 09:40 -> 11:00 is a real hole between two timed things: the gap row.
    item(1, day1.day, nanzenji.id, 9 * 60, 9 * 60 + 40, 0),
    item(1, day1.day, marketBundle.id, 11 * 60, 13 * 60, 1),

    item(2, day2.day, nanzenji.id, 9 * 60, 9 * 60 + 40, 0),
    item(2, day2.day, teramachi.id, 11 * 60, 11 * 60 + 30, 1),
    item(3, day2.day, kamogawa.id, 10 * 60, 10 * 60 + 45, 0),
    item(3, day2.day, yakitori.id, 12 * 60 + 30, 13 * 60 + 15, 1),

    item(4, day3.day, nightBundle.id, 18 * 60, 21 * 60, 0),
    item(5, day3.day, coffee.id, 9 * 60, 9 * 60 + 30, 0),
  ];
}

seed();
