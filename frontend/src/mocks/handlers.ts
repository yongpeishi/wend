import { http, HttpResponse } from 'msw';
import {
  addDayVersion,
  allocateId,
  applyTripDateShift,
  childIdsOf,
  db,
  ensureTripDay,
  findDayVersion,
  findEntry,
  firstLiveVersionId,
  inFinalPlan,
  isScheduled,
  itemsOfVersion,
  liveVersionsOf,
  nextForkName,
  nextFreeName,
  now,
  parentIdsOf,
  seed,
  swapTripDays,
  toEntry,
  toEntryDetail,
  toEntrySummary,
  toTripDay,
  tripAncestorId,
  tripDateShiftFor,
  voteTallyFor,
} from './db';
import type { StoredDayVersion } from './db';
import type { Entry, EntryCategory, EntryKind, Feedback, ScheduleItem, Todo, TripDayWritePayload, User } from '../api/types';

function currentUser(): User | null {
  const user = db.users.find((u) => u.id === db.currentUserId);
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

function requireAuth(): User | HttpResponse<{ error: string }> {
  const user = currentUser();
  if (!user) return HttpResponse.json({ error: 'Not signed in' }, { status: 401 });
  return user;
}

/** The `:day` routes take a YYYY-MM-DD segment; anything else is a 404, the
 * same constraint the real routes put on the parameter. */
function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Every itinerary mutation answers with the whole day, so the client can
 * replace one entry in its cache instead of refetching. */
function tripDayResponse(version: StoredDayVersion, status = 200) {
  const tripDay = db.tripDays.find((d) => d.id === version.trip_day_id);
  if (!tripDay) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
  return HttpResponse.json({ trip_day: toTripDay(tripDay) }, { status });
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

  // Moving a trip's dates moves its plan with them — see tripDateShiftFor. The
  // attempt is its own preview: a change that would push planned days off the
  // end is refused with the list of them, and nothing is written until the
  // same call comes back with `confirm_dropped_days: true`.
  http.patch('/api/entries/:id', async ({ params, request }) => {
    const entry = findEntry(Number(params.id));
    if (!entry) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const body = (await request.json()) as { entry?: Partial<Entry>; confirm_dropped_days?: boolean };

    const shift = tripDateShiftFor(entry, body.entry ?? {});
    if (shift.droppedDays.length > 0 && body.confirm_dropped_days !== true) {
      return HttpResponse.json(
        {
          error: 'dropped_days_need_confirmation',
          dropped_days: shift.droppedDays,
          // Ideas coming back to the rail, not rows destroyed. The wire name
          // is the older one the client already reads.
          dropped_item_count: shift.droppedEntryCount,
        },
        { status: 422 },
      );
    }

    Object.assign(entry, body.entry, { updated_at: now() });
    // Pros and cons arrive whole (there is no per-note endpoint), so they are
    // replaced rather than merged — and stored detached from the request body.
    if (body.entry?.pros) entry.pros = body.entry.pros.map((n) => ({ ...n }));
    if (body.entry?.cons) entry.cons = body.entry.cons.map((n) => ({ ...n }));
    applyTripDateShift(shift);
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
      // The shared summary shape — duration_minutes and location_name included.
      entry: t.entry_id !== null ? (() => {
        const e = findEntry(t.entry_id as number);
        return e ? toEntrySummary(e) : null;
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
  // The Final schedule screen: ONE plan per day. `inFinalPlan` is what draws
  // that line — a forked day sends its first live version only, and a version
  // the user archived is never read. Mirrors the server's
  // ScheduleItem.in_final_plan; the two must not drift.
  http.get('/api/trips/:tripId/schedule', ({ params, request }) => {
    const tripId = Number(params.tripId);
    const url = new URL(request.url);
    const day = url.searchParams.get('day');
    let results = db.scheduleItems.filter((s) => s.trip_id === tripId && inFinalPlan(s));
    if (day) results = results.filter((s) => s.day === day);
    return HttpResponse.json({ schedule_items: results });
  }),

  http.post('/api/trips/:tripId/schedule', async ({ params, request }) => {
    const tripId = Number(params.tripId);
    const body = (await request.json()) as { schedule_item?: Partial<ScheduleItem> };
    const payload = body.schedule_item ?? {};

    // Either key alone is enough: a version knows its date, and a date
    // resolves to its first live version (creating the day if it has none).
    let day = payload.day ?? null;
    let dayVersionId = payload.day_version_id ?? null;
    if (dayVersionId !== null) {
      const version = findDayVersion(dayVersionId);
      if (!version) return HttpResponse.json({ errors: { day_version_id: ['does not exist'] } }, { status: 422 });
      day = day ?? db.tripDays.find((d) => d.id === version.trip_day_id)?.day ?? null;
    }
    if (!day) return HttpResponse.json({ errors: { day: ["can't be blank"] } }, { status: 422 });
    if (dayVersionId === null) dayVersionId = firstLiveVersionId(tripId, day);

    const item: ScheduleItem = {
      id: allocateId(),
      trip_id: tripId,
      entry_id: payload.entry_id ?? null,
      chosen_entry_id: payload.chosen_entry_id ?? null,
      day,
      day_version_id: dayVersionId,
      starts_at_minutes: payload.starts_at_minutes ?? null,
      ends_at_minutes: payload.ends_at_minutes ?? null,
      note: payload.note ?? null,
      position: payload.position ?? 0,
    };
    db.scheduleItems.push(item);
    return HttpResponse.json({ schedule_item: item }, { status: 201 });
  }),

  http.patch('/api/schedule_items/:id', async ({ params, request }) => {
    const item = db.scheduleItems.find((s) => s.id === Number(params.id));
    if (!item) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const body = (await request.json()) as { schedule_item?: Partial<ScheduleItem> };
    const payload = body.schedule_item ?? {};
    if (payload.day_version_id != null && !findDayVersion(payload.day_version_id)) {
      return HttpResponse.json({ errors: { day_version_id: ['does not exist'] } }, { status: 422 });
    }
    Object.assign(item, payload);
    // Moving an item to another date without naming a version re-resolves it
    // against the new day; naming one explicitly is honoured as given.
    if (payload.day && payload.day_version_id == null) {
      item.day_version_id = firstLiveVersionId(item.trip_id, payload.day);
    }
    return HttpResponse.json({ schedule_item: item });
  }),

  http.delete('/api/schedule_items/:id', ({ params }) => {
    db.scheduleItems = db.scheduleItems.filter((s) => s.id !== Number(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  // ---- Itinerary ---------------------------------------------------------
  // CONTRACT §2. Nothing here hard-deletes a version: "archived" means kept
  // aside, and every response is the whole affected day.
  http.get('/api/trips/:tripId/itinerary', ({ params }) => {
    const tripId = Number(params.tripId);
    const days = db.tripDays
      .filter((d) => d.trip_id === tripId)
      .slice()
      .sort((a, b) => a.day.localeCompare(b.day));
    return HttpResponse.json({ trip_days: days.map(toTripDay) });
  }),

  // "Move Day 2 to be Day 3" — an exchange, not a reorder: Day 3 comes back to
  // Day 2 rather than being pushed along. Either date may be empty. The whole
  // trip answers, because a swap changes two of its days at once.
  http.post('/api/trips/:tripId/itinerary/swap_days', async ({ params, request }) => {
    const tripId = Number(params.tripId);
    const trip = findEntry(tripId);
    const body = (await request.json()) as { a?: string; b?: string };

    if (!isIsoDate(body.a) || !isIsoDate(body.b)) {
      return HttpResponse.json({ error: 'invalid_day' }, { status: 422 });
    }
    // A trip with no dates has no range for a day to be inside of.
    const inTrip = (day: string) =>
      Boolean(trip?.starts_on && trip.ends_on && day >= trip.starts_on && day <= trip.ends_on);
    if (!inTrip(body.a) || !inTrip(body.b)) {
      return HttpResponse.json({ error: 'day_outside_trip' }, { status: 422 });
    }

    swapTripDays(tripId, body.a, body.b);
    const days = db.tripDays
      .filter((d) => d.trip_id === tripId)
      .slice()
      .sort((a, b) => a.day.localeCompare(b.day));
    return HttpResponse.json({ trip_days: days.map(toTripDay) });
  }),

  http.patch('/api/trips/:tripId/days/:day', async ({ params, request }) => {
    if (!isIsoDate(params.day)) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const tripDay = ensureTripDay(Number(params.tripId), String(params.day));
    const body = (await request.json()) as { trip_day?: TripDayWritePayload };
    const payload = body.trip_day ?? {};
    // Presence, not truthiness: sending either key as null is how you clear it.
    if ('lodging_entry_id' in payload) tripDay.lodging_entry_id = payload.lodging_entry_id ?? null;
    if ('lodging_label' in payload) tripDay.lodging_label = payload.lodging_label ?? null;
    tripDay.updated_at = now();
    return HttpResponse.json({ trip_day: toTripDay(tripDay) });
  }),

  // Fork: copy the last live version's items into a new lettered version.
  http.post('/api/trips/:tripId/days/:day/versions', ({ params }) => {
    if (!isIsoDate(params.day)) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const tripDay = ensureTripDay(Number(params.tripId), String(params.day));
    const live = liveVersionsOf(tripDay.id);
    const source = live[live.length - 1];
    const forked = addDayVersion(tripDay.id, nextForkName(tripDay.id), live.length);
    if (source) {
      itemsOfVersion(source.id).forEach((item, position) => {
        db.scheduleItems.push({ ...item, id: allocateId(), day_version_id: forked.id, position });
      });
    }
    return HttpResponse.json({ trip_day: toTripDay(tripDay) }, { status: 201 });
  }),

  // Keep: settle the day on this version, archiving the alternatives. Keeping
  // the only live version is a no-op, not a rename.
  http.post('/api/day_versions/:id/keep', ({ params }) => {
    const version = findDayVersion(Number(params.id));
    if (!version) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    const siblings = liveVersionsOf(version.trip_day_id).filter((v) => v.id !== version.id);
    if (siblings.length) {
      const archivedAt = now();
      for (const sibling of siblings) {
        sibling.archived_at = archivedAt;
        sibling.updated_at = archivedAt;
      }
      version.name = 'Version A';
      version.position = 0;
      version.updated_at = archivedAt;
    }
    return tripDayResponse(version);
  }),

  http.post('/api/day_versions/:id/restore', ({ params }) => {
    const version = findDayVersion(Number(params.id));
    if (!version) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    if (version.archived_at) {
      // Both read while this version is still archived, so it is not counted
      // among the live names it has to avoid.
      const live = liveVersionsOf(version.trip_day_id);
      const name = nextFreeName(version.trip_day_id);
      version.archived_at = null;
      version.name = name;
      version.position = live.length;
      version.updated_at = now();
    }
    return tripDayResponse(version);
  }),

  http.delete('/api/day_versions/:id', ({ params }) => {
    const version = findDayVersion(Number(params.id));
    if (!version) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    if (!version.archived_at) {
      // A day always keeps at least one live version.
      if (liveVersionsOf(version.trip_day_id).length <= 1) {
        return HttpResponse.json({ errors: { base: ['A day needs at least one version'] } }, { status: 422 });
      }
      version.archived_at = now();
      version.updated_at = version.archived_at;
      liveVersionsOf(version.trip_day_id).forEach((v, position) => {
        v.position = position;
      });
    }
    return tripDayResponse(version);
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
