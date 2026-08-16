// Types mirror architecture.md §4 "Serializer shapes" and §2 "Core data model"
// exactly — snake_case keys, ISO 8601 timestamps as strings. Keep this file in
// sync with the backend serializers; it is the frontend's half of the contract.

export type EntryKind = 'trip' | 'idea' | 'bundle';

export type EntryCategory = 'place' | 'food' | 'activity' | 'lodging' | 'transport' | 'other';

/**
 * One line of a trip's pros/cons list. `id` is generated on the client
 * (`crypto.randomUUID()`) and is what remove targets — the server stores the
 * array as given and never mints ids of its own.
 */
export interface EntryNote {
  id: string;
  text: string;
}

export interface VoteTally {
  total: number;
  count: number;
  average: number;
  by_user?: Record<string, number>;
}

/** List/board form of Entry — what GET /api/entries and nested children return. */
export interface Entry {
  id: number;
  kind: EntryKind;
  title: string;
  description: string | null;
  category: EntryCategory | null;
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
  /** Always present (empty array when there are none) — see EntryNote. */
  pros: EntryNote[];
  cons: EntryNote[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  children_count: number;
  todos_open_count: number;
  vote_tally: VoteTally;
  my_vote: number | null;
  scheduled: boolean;
  /** Present only on GET /api/trips/:trip_id/nearby results. */
  distance_km?: number;
}

/**
 * The compact form of an Entry that other resources embed — `parents`,
 * `Todo.entry`, and the itinerary's `ItineraryItem.entry`/`members`. Mirrors
 * `EntrySerializer.summary`. `duration_minutes` and `location_name` carry the
 * same nullability they have on the full `Entry`.
 */
export interface EntrySummary {
  id: number;
  kind: EntryKind;
  title: string;
  category: EntryCategory | null;
  duration_minutes: number | null;
  location_name: string | null;
}

/**
 * GET /api/entries/:id — the backend agent's assumptions.md flags that §4 reads
 * two ways ("-> 200 { entry, parents, children, votes, todos }" vs. the
 * serializer-shapes prose, which sounds like a merge into `entry`) and records
 * the literal endpoint line as what was actually implemented: `entry` in list
 * form, with parents/children/todos/votes as TOP-LEVEL SIBLINGS, not merged in.
 * Typed against that confirmed backend behaviour, not the ambiguous prose.
 */
export interface EntryDetailResponse {
  entry: Entry;
  parents: EntrySummary[];
  children: Entry[];
  todos: Todo[];
  votes: Vote[];
}

export interface EntryTree {
  entry: Entry;
  descendants: Entry[];
}

export interface EntryLink {
  id: number;
  parent_id: number;
  child_id: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Vote {
  id: number;
  entry_id: number;
  user_id: number;
  user_name: string | null;
  score: -2 | -1 | 0 | 1 | 2;
}

export interface Todo {
  id: number;
  title: string;
  entry_id: number | null;
  trip_id: number | null;
  done_at: string | null;
  due_on: string | null;
  position: number;
  /** Attached by the unified checklist view (GET /api/todos?trip_id=X). */
  entry?: EntrySummary | null;
}

export interface ScheduleItem {
  id: number;
  trip_id: number;
  entry_id: number | null;
  chosen_entry_id: number | null;
  day: string;
  /**
   * Which version of the day this item sits in — see DayVersion. Nullable
   * because the column stays nullable for legacy rows written through
   * POST /api/trips/:id/schedule before the itinerary existed; every item the
   * itinerary creates has one.
   */
  day_version_id: number | null;
  /** Minutes from midnight, 0..1439. Null = unscheduled that day. */
  starts_at_minutes: number | null;
  ends_at_minutes: number | null;
  note: string | null;
  position: number;
}

// ---- Itinerary -----------------------------------------------------------
// A trip day can be planned more than one way. Each way is a "version" — an
// alternative running order for the same date ("Version A", "Version B") that
// you compare side by side and then settle with `keep`. Keeping one version
// archives its siblings rather than deleting them: `archived_at` means
// "kept, but not the one we chose", and an archived version can be restored.

/** A ScheduleItem as the itinerary endpoints serialize it, with its entry inlined. */
export interface ItineraryItem extends ScheduleItem {
  entry: EntrySummary | null;
  /** The bundle's direct children in link order. Empty unless entry.kind === 'bundle'. */
  members: EntrySummary[];
}

/** One alternative plan for a single day. */
export interface DayVersion {
  id: number;
  trip_day_id: number;
  /** "Version A", "Version B", … — renamed as versions are kept and restored. */
  name: string;
  position: number;
  /** Set = this version was kept aside rather than chosen. Null = live. */
  archived_at: string | null;
  /** Ordered by starts_at_minutes, then position. */
  schedule_items: ItineraryItem[];
}

/** One date of a trip, from GET /api/trips/:trip_id/itinerary. */
export interface TripDay {
  id: number;
  trip_id: number;
  /** ISO date, "2026-10-12". */
  day: string;
  lodging_entry_id: number | null;
  /** Free text, for when where you sleep is not a kept place ("On the plane"). */
  lodging_label: string | null;
  /** Resolved by the server: the entry's title, else lodging_label, else null. */
  lodging_title: string | null;
  /** Live versions only, ordered by position. Always at least one. */
  versions: DayVersion[];
  /** Kept-but-not-chosen versions, most recently archived first. */
  archived_versions: DayVersion[];
}

export interface User {
  id: number;
  name: string;
  email: string;
}

export type FeedbackStatus = 'new' | 'triaged' | 'done';

/**
 * Feedback about the app itself. Not an Entry — see backend
 * `app/models/feedback.rb`. `user_agent` is stored server-side for diagnosis
 * but deliberately not serialized back, so it is absent here too.
 */
export interface Feedback {
  id: number;
  message: string;
  user_id: number;
  /** The full client URL the user was on, e.g. "http://localhost:5173/trips/3/schedule". */
  url: string | null;
  /** Both set only when the user pointed at something. */
  element_selector: string | null;
  /** The element's raw class attribute, e.g. "_chip_7ilc4_44" — a grep hint. */
  element_classes: string | null;
  status: FeedbackStatus;
  created_at: string;
  updated_at: string;
}

// ---- Request payloads --------------------------------------------------

export type EntryWritePayload = Partial<
  Pick<
    Entry,
    | 'kind'
    | 'title'
    | 'description'
    | 'category'
    | 'starts_on'
    | 'ends_on'
    | 'location_name'
    | 'address'
    | 'lat'
    | 'lng'
    | 'duration_minutes'
    | 'source_url'
    | 'notes'
    | 'from_entry_id'
    | 'to_entry_id'
    // Pros and cons are written whole: there is no per-note endpoint, so
    // adding or removing one sends the entire array back through PATCH.
    | 'pros'
    | 'cons'
  >
>;

export interface CreateEntryParams {
  entry: EntryWritePayload;
  parent_id?: number;
}

export interface UpdateEntryParams {
  entry: EntryWritePayload;
  /**
   * Only read when the write moves a trip's dates. Moving them moves the whole
   * plan by the same delta (Day 2 stays Day 2), and a shorter trip can push
   * planned days off the end — the server refuses that with
   * `DroppedDaysBody` until this says yes. Defaults to false.
   */
  confirm_dropped_days?: boolean;
}

export interface EntriesQuery {
  kind?: EntryKind;
  trip_id?: number;
  parent_id?: number;
  category?: EntryCategory;
  unassigned?: boolean;
  scheduled?: boolean;
  q?: string;
  include_archived?: boolean;
}

export type TodoWritePayload = Partial<
  Pick<Todo, 'title' | 'entry_id' | 'trip_id' | 'done_at' | 'due_on' | 'position'>
>;

export interface TodosQuery {
  trip_id?: number;
  entry_id?: number;
  done?: boolean;
}

export type ScheduleItemWritePayload = Partial<
  Pick<
    ScheduleItem,
    | 'entry_id'
    | 'chosen_entry_id'
    | 'day'
    // Omitted on create = the day's first live version, created if the day has none.
    | 'day_version_id'
    | 'starts_at_minutes'
    | 'ends_at_minutes'
    | 'note'
    | 'position'
  >
>;

/**
 * PATCH /api/trips/:trip_id/days/:day — the lodging is all a day owns directly.
 * Sending both keys as null clears it.
 */
export type TripDayWritePayload = Partial<Pick<TripDay, 'lodging_entry_id' | 'lodging_label'>>;

/** Only what the reporter may set — `status` and `user_id` are server-owned. */
export type FeedbackWritePayload = Pick<Feedback, 'message'> &
  Partial<Pick<Feedback, 'url' | 'element_selector' | 'element_classes'>>;

export interface NearbyQuery {
  lat: number;
  lng: number;
  radius_km?: number;
  exclude_scheduled?: boolean;
}

// ---- Errors --------------------------------------------------------------

/** { "errors": { "field": ["message"] } } — 422 validation shape. */
export interface ValidationErrorBody {
  errors: Record<string, string[]>;
}

/** { "error": "message" } — generic 4xx/5xx shape. */
export interface SimpleErrorBody {
  error: string;
}

/**
 * The 422 PATCH /api/entries/:id answers with when the new dates would push
 * planned days off the end of the trip. Nothing has changed when this arrives:
 * the attempt is its own preview, and re-sending with `confirm_dropped_days`
 * is what applies it.
 *
 * `dropped_days` are the dates AFTER the shift, ascending;
 * `dropped_item_count` is how many ideas go back to "Not placed yet" — the
 * count the warning promises, not the number of placements on those days. An
 * idea also placed on a day inside the new dates stays placed and is not one
 * of them, and one idea placed twice counts once.
 */
export interface DroppedDaysBody {
  error: 'dropped_days_need_confirmation';
  dropped_days: string[];
  dropped_item_count: number;
}
