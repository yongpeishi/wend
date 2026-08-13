import { http, HttpResponse } from 'msw';
import {
  allocateId,
  childIdsOf,
  db,
  findEntry,
  isScheduled,
  now,
  parentIdsOf,
  seed,
  toEntry,
  toEntryDetail,
  tripAncestorId,
  voteTallyFor,
} from './db';
import type { Entry, EntryCategory, EntryKind, Feedback, ScheduleItem, Todo, User } from '../api/types';

function currentUser(): User | null {
  const user = db.users.find((u) => u.id === db.currentUserId);
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

function requireAuth(): User | HttpResponse<{ error: string }> {
  const user = currentUser();
  if (!user) return HttpResponse.json({ error: 'Not signed in' }, { status: 401 });
  return user;
}

function isDescendantOfTrip(entryId: number, tripId: number): boolean {
  const visited = new Set<number>();
  const queue = [...parentIdsOf(entryId)];
  while (queue.length) {
    const parentId = queue.shift();
    if (parentId === undefined || visited.has(parentId)) continue;
    if (parentId === tripId) return true;
    visited.add(parentId);
    queue.push(...parentIdsOf(parentId));
  }
  return false;
}

export const handlers = [
  // ---- Session -----------------------------------------------------------
  http.post('/api/session', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    const user = db.users.find((u) => u.email === body.email && u.password === body.password);
    if (!user) return HttpResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    db.currentUserId = user.id;
    return HttpResponse.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
  }),

  http.delete('/api/session', () => {
    db.currentUserId = null;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/me', () => {
    const user = currentUser();
    if (!user) return HttpResponse.json({ error: 'Not signed in' }, { status: 401 });
    return HttpResponse.json({ user });
  }),

  http.post('/api/users', async ({ request }) => {
    const body = (await request.json()) as { name?: string; email?: string; password?: string };
    if (!body.name || !body.email || !body.password) {
      return HttpResponse.json(
        { errors: { name: !body.name ? ["can't be blank"] : [], email: !body.email ? ["can't be blank"] : [] } },
        { status: 422 },
      );
    }
    if (db.users.some((u) => u.email === body.email)) {
      return HttpResponse.json({ errors: { email: ['has already been taken'] } }, { status: 422 });
    }
    const user = { id: allocateId(), name: body.name, email: body.email, password: body.password };
    db.users.push(user);
    db.currentUserId = user.id;
    return HttpResponse.json({ user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
  }),

  // ---- Entries -------------------------------------------------------------
  http.get('/api/entries', ({ request }) => {
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind') as EntryKind | null;
    const tripId = url.searchParams.get('trip_id');
    const parentId = url.searchParams.get('parent_id');
    const category = url.searchParams.get('category') as EntryCategory | null;
    const unassigned = url.searchParams.get('unassigned') === 'true';
    const scheduled = url.searchParams.get('scheduled');
    const q = url.searchParams.get('q');
    const includeArchived = url.searchParams.get('include_archived') === 'true';

    let results = db.entries.slice();
    if (!includeArchived) results = results.filter((e) => !e.archived_at);
    // Per doc/assumptions.md (backend agent): unassigned=true always applies the
    // library scope (kind: idea) regardless of any `kind` param also passed.
    if (unassigned) {
      results = results.filter((e) => e.kind === 'idea');
    } else if (kind) {
      results = results.filter((e) => e.kind === kind);
    }
    if (category) results = results.filter((e) => e.category === category);
    if (q) results = results.filter((e) => e.title.toLowerCase().includes(q.toLowerCase()));
    if (parentId) {
      const ids = new Set(childIdsOf(Number(parentId)));
      results = results.filter((e) => ids.has(e.id));
    }
    if (tripId) {
      const id = Number(tripId);
      results = results.filter((e) => e.id === id || isDescendantOfTrip(e.id, id));
    }
    if (unassigned) {
      results = results.filter((e) => e.kind === 'idea' && tripAncestorId(e.id) === null);
    }
    if (scheduled !== null) {
      const want = scheduled === 'true';
      results = results.filter((e) => isScheduled(e.id) === want);
    }

    return HttpResponse.json({ entries: results.map((e) => toEntry(e, db.currentUserId)) });
  }),

  http.post('/api/entries', async ({ request }) => {
    const body = (await request.json()) as { entry?: Partial<Entry>; parent_id?: number };
    if (!body.entry?.title || !body.entry.kind) {
      return HttpResponse.json({ errors: { title: ["can't be blank"] } }, { status: 422 });
    }
    const id = allocateId();
    const timestamp = now();
    db.entries.push({
      id,
      kind: body.entry.kind,
      title: body.entry.title,
      description: body.entry.description ?? null,
      category: body.entry.category ?? null,
      starts_on: body.entry.starts_on ?? null,
      ends_on: body.entry.ends_on ?? null,
      location_name: body.entry.location_name ?? null,
      address: body.entry.address ?? null,
      lat: body.entry.lat ?? null,
      lng: body.entry.lng ?? null,
      duration_minutes: body.entry.duration_minutes ?? null,
      source_url: body.entry.source_url ?? null,
      notes: body.entry.notes ?? null,
      from_entry_id: body.entry.from_entry_id ?? null,
      to_entry_id: body.entry.to_entry_id ?? null,
      pros: body.entry.pros ?? [],
      cons: body.entry.cons ?? [],
      created_by_id: db.currentUserId ?? 1,
      archived_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    });
    if (body.parent_id) {
      const position = childIdsOf(body.parent_id).length;
      db.links.push({ id: allocateId(), parent_id: body.parent_id, child_id: id, position, created_at: timestamp, updated_at: timestamp });
    }
    const entry = findEntry(id);
    if (!entry) return HttpResponse.json({ error: 'Failed to create entry' }, { status: 500 });
    return HttpResponse.json({ entry: toEntry(entry, db.currentUserId) }, { status: 201 });
  }),

  http.get('/api/entries/:id', ({ params }) => {
    const entry = findEntry(Number(params.id));
    if (!entry) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    return HttpResponse.json(toEntryDetail(entry, db.currentUserId));
  }),

  http.patch('/api/entries/:id', async ({ params, request }) => {
    const entry = findEntry(Number(params.id));
    if (!entry) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const body = (await request.json()) as { entry?: Partial<Entry> };
    Object.assign(entry, body.entry, { updated_at: now() });
    // Pros and cons arrive whole (there is no per-note endpoint), so they are
    // replaced rather than merged — and stored detached from the request body.
    if (body.entry?.pros) entry.pros = body.entry.pros.map((n) => ({ ...n }));
    if (body.entry?.cons) entry.cons = body.entry.cons.map((n) => ({ ...n }));
    return HttpResponse.json({ entry: toEntry(entry, db.currentUserId) });
  }),

  http.delete('/api/entries/:id', ({ params }) => {
    const entry = findEntry(Number(params.id));
    if (!entry) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    entry.archived_at = now();
    return HttpResponse.json({ entry: toEntry(entry, db.currentUserId) });
  }),

  http.post('/api/entries/:id/restore', ({ params }) => {
    const entry = findEntry(Number(params.id));
    if (!entry) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    entry.archived_at = null;
    return HttpResponse.json({ entry: toEntry(entry, db.currentUserId) });
  }),

  http.get('/api/entries/:id/tree', ({ params, request }) => {
    const entry = findEntry(Number(params.id));
    if (!entry) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const url = new URL(request.url);
    const depth = Number(url.searchParams.get('depth') ?? 3);
    const descendants: Entry[] = [];
    const visit = (id: number, remaining: number) => {
      if (remaining <= 0) return;
      for (const childId of childIdsOf(id)) {
        const child = findEntry(childId);
        if (!child) continue;
        descendants.push(toEntry(child, db.currentUserId));
        visit(childId, remaining - 1);
      }
    };
    visit(entry.id, depth);
    return HttpResponse.json({ entry: toEntry(entry, db.currentUserId), descendants });
  }),

  http.post('/api/entries/:id/lift', ({ params }) => {
    const entry = findEntry(Number(params.id));
    if (!entry) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    entry.kind = 'trip';
    db.links = db.links.filter((l) => l.child_id !== entry.id);
    return HttpResponse.json({ entry: toEntry(entry, db.currentUserId) });
  }),

  http.post('/api/entries/:id/absorb', async ({ params, request }) => {
    const entry = findEntry(Number(params.id));
    if (!entry) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const body = (await request.json()) as { into_id?: number };
    if (!body.into_id) return HttpResponse.json({ errors: { into_id: ["can't be blank"] } }, { status: 422 });
    entry.kind = 'idea';
    const position = childIdsOf(body.into_id).length;
    db.links.push({ id: allocateId(), parent_id: body.into_id, child_id: entry.id, position, created_at: now(), updated_at: now() });
    return HttpResponse.json({ entry: toEntry(entry, db.currentUserId) });
  }),

  http.post('/api/entries/:id/fork', ({ params }) => {
    const entry = findEntry(Number(params.id));
    if (!entry) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const id = allocateId();
    const timestamp = now();
    db.entries.push({
      ...entry,
      id,
      title: `${entry.title} (copy)`,
      pros: entry.pros.map((n) => ({ ...n })),
      cons: entry.cons.map((n) => ({ ...n })),
      created_at: timestamp,
      updated_at: timestamp,
    });
    childIdsOf(entry.id).forEach((childId, position) => {
      db.links.push({ id: allocateId(), parent_id: id, child_id: childId, position, created_at: timestamp, updated_at: timestamp });
    });
    const forked = findEntry(id);
    if (!forked) return HttpResponse.json({ error: 'Failed to fork' }, { status: 500 });
    return HttpResponse.json({ entry: toEntry(forked, db.currentUserId) }, { status: 201 });
  }),

  // ---- Links ---------------------------------------------------------------
  http.post('/api/entries/:id/links', async ({ params, request }) => {
    const parentId = Number(params.id);
    const body = (await request.json()) as { child_id?: number; position?: number };
    if (!body.child_id) return HttpResponse.json({ errors: { child_id: ["can't be blank"] } }, { status: 422 });
    const position = body.position ?? childIdsOf(parentId).length;
    const link = { id: allocateId(), parent_id: parentId, child_id: body.child_id, position, created_at: now(), updated_at: now() };
    db.links.push(link);
    return HttpResponse.json({ link }, { status: 201 });
  }),

  http.patch('/api/entries/:id/links/:childId', async ({ params, request }) => {
    const link = db.links.find((l) => l.parent_id === Number(params.id) && l.child_id === Number(params.childId));
    if (!link) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const body = (await request.json()) as { position?: number };
    if (body.position !== undefined) link.position = body.position;
    link.updated_at = now();
    return HttpResponse.json({ link });
  }),

  http.delete('/api/entries/:id/links/:childId', ({ params }) => {
    db.links = db.links.filter((l) => !(l.parent_id === Number(params.id) && l.child_id === Number(params.childId)));
    return new HttpResponse(null, { status: 204 });
  }),

  http.post('/api/entries/:id/links/reorder', async ({ params, request }) => {
    const parentId = Number(params.id);
    const body = (await request.json()) as { child_ids?: number[] };
    (body.child_ids ?? []).forEach((childId, position) => {
      const link = db.links.find((l) => l.parent_id === parentId && l.child_id === childId);
      if (link) link.position = position;
    });
    return HttpResponse.json({ links: db.links.filter((l) => l.parent_id === parentId).sort((a, b) => a.position - b.position) });
  }),

  // ---- Votes -----------------------------------------------------------
  http.put('/api/entries/:id/vote', async ({ params, request }) => {
    const auth = requireAuth();
    if (auth instanceof HttpResponse) return auth;
    const entryId = Number(params.id);
    const body = (await request.json()) as { score?: number };
    if (body.score === undefined || body.score < -2 || body.score > 2) {
      return HttpResponse.json({ errors: { score: ['must be between -2 and 2'] } }, { status: 422 });
    }
    let vote = db.votes.find((v) => v.entry_id === entryId && v.user_id === auth.id);
    if (vote) {
      vote.score = body.score as -2 | -1 | 0 | 1 | 2;
    } else {
      vote = {
        id: allocateId(),
        entry_id: entryId,
        user_id: auth.id,
        user_name: auth.name,
        score: body.score as -2 | -1 | 0 | 1 | 2,
      };
      db.votes.push(vote);
    }
    return HttpResponse.json({ vote, tally: voteTallyFor(entryId) });
  }),

  http.delete('/api/entries/:id/vote', ({ params }) => {
    const auth = requireAuth();
    if (auth instanceof HttpResponse) return auth;
    const entryId = Number(params.id);
    db.votes = db.votes.filter((v) => !(v.entry_id === entryId && v.user_id === auth.id));
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- Todos -----------------------------------------------------------
  http.get('/api/todos', ({ request }) => {
    const url = new URL(request.url);
    const tripId = url.searchParams.get('trip_id');
    const entryId = url.searchParams.get('entry_id');
    const done = url.searchParams.get('done');
    let results = db.todos.slice();
    if (tripId) {
      const id = Number(tripId);
      results = results.filter((t) => t.trip_id === id || (t.entry_id !== null && isDescendantOfTrip(t.entry_id, id)));
    }
    if (entryId) results = results.filter((t) => t.entry_id === Number(entryId));
    if (done !== null) results = results.filter((t) => (done === 'true' ? t.done_at !== null : t.done_at === null));
    const withEntry = results.map((t) => ({
      ...t,
      entry: t.entry_id !== null ? (() => {
        const e = findEntry(t.entry_id as number);
        return e ? { id: e.id, kind: e.kind, title: e.title, category: e.category } : null;
      })() : null,
    }));
    return HttpResponse.json({ todos: withEntry });
  }),

  http.post('/api/todos', async ({ request }) => {
    const body = (await request.json()) as { todo?: Partial<Todo> };
    if (!body.todo?.title || (!body.todo.entry_id && !body.todo.trip_id)) {
      return HttpResponse.json({ errors: { title: ["can't be blank"] } }, { status: 422 });
    }
    const todo: Todo = {
      id: allocateId(),
      title: body.todo.title,
      entry_id: body.todo.entry_id ?? null,
      trip_id: body.todo.trip_id ?? null,
      done_at: body.todo.done_at ?? null,
      due_on: body.todo.due_on ?? null,
      position: body.todo.position ?? 0,
    };
    db.todos.push(todo);
    return HttpResponse.json({ todo }, { status: 201 });
  }),

  http.patch('/api/todos/:id', async ({ params, request }) => {
    const todo = db.todos.find((t) => t.id === Number(params.id));
    if (!todo) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const body = (await request.json()) as { todo?: Partial<Todo> };
    Object.assign(todo, body.todo);
    return HttpResponse.json({ todo });
  }),

  http.delete('/api/todos/:id', ({ params }) => {
    db.todos = db.todos.filter((t) => t.id !== Number(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- Schedule --------------------------------------------------------
  http.get('/api/trips/:tripId/schedule', ({ params, request }) => {
    const tripId = Number(params.tripId);
    const url = new URL(request.url);
    const day = url.searchParams.get('day');
    let results = db.scheduleItems.filter((s) => s.trip_id === tripId);
    if (day) results = results.filter((s) => s.day === day);
    return HttpResponse.json({ schedule_items: results });
  }),

  http.post('/api/trips/:tripId/schedule', async ({ params, request }) => {
    const tripId = Number(params.tripId);
    const body = (await request.json()) as { schedule_item?: Partial<ScheduleItem> };
    if (!body.schedule_item?.day) {
      return HttpResponse.json({ errors: { day: ["can't be blank"] } }, { status: 422 });
    }
    const item: ScheduleItem = {
      id: allocateId(),
      trip_id: tripId,
      entry_id: body.schedule_item.entry_id ?? null,
      chosen_entry_id: body.schedule_item.chosen_entry_id ?? null,
      day: body.schedule_item.day,
      day_version_id: body.schedule_item.day_version_id ?? null,
      starts_at_minutes: body.schedule_item.starts_at_minutes ?? null,
      ends_at_minutes: body.schedule_item.ends_at_minutes ?? null,
      note: body.schedule_item.note ?? null,
      position: body.schedule_item.position ?? 0,
    };
    db.scheduleItems.push(item);
    return HttpResponse.json({ schedule_item: item }, { status: 201 });
  }),

  http.patch('/api/schedule_items/:id', async ({ params, request }) => {
    const item = db.scheduleItems.find((s) => s.id === Number(params.id));
    if (!item) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const body = (await request.json()) as { schedule_item?: Partial<ScheduleItem> };
    Object.assign(item, body.schedule_item);
    return HttpResponse.json({ schedule_item: item });
  }),

  http.delete('/api/schedule_items/:id', ({ params }) => {
    db.scheduleItems = db.scheduleItems.filter((s) => s.id !== Number(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- Nearby ------------------------------------------------------------
  http.get('/api/trips/:tripId/nearby', ({ params, request }) => {
    const tripId = Number(params.tripId);
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const radiusKm = Number(url.searchParams.get('radius_km') ?? 2);
    const excludeScheduled = url.searchParams.get('exclude_scheduled') === 'true';

    const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
      const R = 6371;
      const dLat = ((bLat - aLat) * Math.PI) / 180;
      const dLng = ((bLng - aLng) * Math.PI) / 180;
      const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };

    const results = db.entries
      .filter((e) => !e.archived_at && e.lat !== null && e.lng !== null && (e.id === tripId || isDescendantOfTrip(e.id, tripId)))
      .filter((e) => (excludeScheduled ? !isScheduled(e.id) : true))
      .map((e) => ({ ...toEntry(e, db.currentUserId), distance_km: Number(haversineKm(lat, lng, e.lat as number, e.lng as number).toFixed(2)) }))
      .filter((e) => e.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);

    return HttpResponse.json({ entries: results });
  }),

  // ---- Feedback ----------------------------------------------------------
  http.get('/api/feedbacks', () => {
    const auth = requireAuth();
    if (auth instanceof HttpResponse) return auth;

    const mine = db.feedbacks
      .filter((f) => f.user_id === auth.id)
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    return HttpResponse.json({ feedbacks: mine });
  }),

  http.post('/api/feedbacks', async ({ request }) => {
    const auth = requireAuth();
    if (auth instanceof HttpResponse) return auth;

    const body = (await request.json()) as { feedback?: Partial<Feedback> };
    const message = body.feedback?.message?.trim();
    if (!message) {
      return HttpResponse.json({ errors: { message: ["can't be blank"] } }, { status: 422 });
    }

    const selector = body.feedback?.element_selector ?? null;
    const feedback: Feedback = {
      id: allocateId(),
      message,
      user_id: auth.id,
      url: body.feedback?.url ?? null,
      element_selector: selector,
      // Mirrors the model's normaliser: classes with no selector point at nothing.
      element_classes: selector ? (body.feedback?.element_classes ?? null) : null,
      status: 'new',
      created_at: now(),
      updated_at: now(),
    };
    db.feedbacks.push(feedback);
    return HttpResponse.json({ feedback }, { status: 201 });
  }),
];

/** Test helper: reset the in-memory store between tests. */
export function resetDb() {
  seed();
}
