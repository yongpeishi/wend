// Types mirror architecture.md §4 "Serializer shapes" and §2 "Core data model"
// exactly — snake_case keys, ISO 8601 timestamps as strings. Keep this file in
// sync with the backend serializers; it is the frontend's half of the contract.

export type EntryKind = 'trip' | 'idea' | 'bundle';

export type EntryCategory = 'place' | 'food' | 'activity' | 'lodging' | 'transport' | 'other';

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

export interface EntrySummary {
  id: number;
  kind: EntryKind;
  title: string;
  category: EntryCategory | null;
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
  /** Minutes from midnight, 0..1439. Null = unscheduled that day. */
  starts_at_minutes: number | null;
  ends_at_minutes: number | null;
  note: string | null;
  position: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
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
  >
>;

export interface CreateEntryParams {
  entry: EntryWritePayload;
  parent_id?: number;
}

export interface UpdateEntryParams {
  entry: EntryWritePayload;
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
    'entry_id' | 'chosen_entry_id' | 'day' | 'starts_at_minutes' | 'ends_at_minutes' | 'note' | 'position'
  >
>;

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
