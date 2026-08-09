// A tiny in-memory backend used by the MSW handlers. Dev/test only — mirrors
// architecture.md §2-4 closely enough for the app and its tests to run without
// the Rails API. Not meant to be a faithful reimplementation of every rule
// (e.g. cycle detection on links is not enforced here).
import type {
  Entry,
  EntryDetailResponse,
  EntryLink,
  EntrySummary,
  ScheduleItem,
  Todo,
  User,
  Vote,
  VoteTally,
} from '../api/types';

interface StoredUser extends User {
  password: string;
}

interface StoredEntry {
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
  created_by_id: number;
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

export function isScheduled(entryId: number): boolean {
  return db.scheduleItems.some((s) => s.entry_id === entryId || s.chosen_entry_id === entryId);
}

export function toEntrySummary(entry: StoredEntry): EntrySummary {
  return { id: entry.id, kind: entry.kind, title: entry.title, category: entry.category };
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

function addLink(parentId: number, childId: number, position: number) {
  db.links.push({ id: allocateId(), parent_id: parentId, child_id: childId, position, created_at: now(), updated_at: now() });
}

export function seed() {
  db.users = [{ id: 1, name: 'Demo Traveler', email: 'demo@wend.app', password: 'password' }];
  db.currentUserId = null;

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
    category: 'activity',
    location_name: 'Kiyamachi-dori',
    address: 'Kyoto',
    lat: 35.0086,
    lng: 135.7717,
    duration_minutes: 90,
  };

  const dinnerBundle: StoredEntry = {
    ...trip,
    id: 4,
    kind: 'bundle',
    title: 'Day one dinner options',
    description: null,
    category: null,
  };

  const library1: StoredEntry = {
    ...trip,
    id: 5,
    kind: 'idea',
    title: 'Fushimi Inari at dawn',
    description: 'Saved from a friend’s trip report.',
    category: 'place',
    location_name: 'Fushimi Inari Taisha',
    lat: 34.9671,
    lng: 135.7727,
    source_url: 'https://example.com/fushimi-inari',
  };

  db.entries = [trip, nanzenji, kiyamachi, dinnerBundle, library1];

  addLink(trip.id, nanzenji.id, 0);
  addLink(trip.id, kiyamachi.id, 1);
  addLink(trip.id, dinnerBundle.id, 2);

  db.votes = [
    { id: allocateId(), entry_id: nanzenji.id, user_id: 1, score: 2 },
    { id: allocateId(), entry_id: kiyamachi.id, user_id: 1, score: 1 },
  ];

  db.todos = [
    { id: allocateId(), title: 'Check opening hours', entry_id: nanzenji.id, trip_id: null, done_at: null, due_on: null, position: 0 },
    { id: allocateId(), title: 'Apply for visa', entry_id: null, trip_id: trip.id, done_at: null, due_on: '2026-10-01', position: 0 },
  ];

  db.scheduleItems = [
    {
      id: allocateId(),
      trip_id: trip.id,
      entry_id: nanzenji.id,
      chosen_entry_id: null,
      day: '2026-11-02',
      starts_at_minutes: 9 * 60,
      ends_at_minutes: 9 * 60 + 40,
      note: null,
      position: 0,
    },
  ];
}

seed();
