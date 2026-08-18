# Wend — MVP Architecture Contract

This is the single source of truth for the MVP build. Backend and frontend agents both
implement against this document. If something here conflicts with what you think is
better, **implement what is written here** and note the disagreement in
`.claude/interaction/wend-mvp/decisions.md` — a shared contract that is followed beats a
better one that isn't.

---

## 1. Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Backend | Rails 8.1 (`--api`), Ruby 4.0.3 | `backend/` |
| Database | SQLite (Rails 8 default) | No local Postgres. See ADR-1. |
| Type check | Sorbet + Tapioca; fall back to RBS + Steep | See ADR-2. |
| Authorization | Pundit policy objects | Trip roles. See ADR-5. |
| Frontend | Vite + React 19 + TypeScript (strict) | `frontend/` |
| Routing | React Router v7 (declarative mode) | |
| Server state | TanStack Query v5 | |
| Styling | Plain CSS + design tokens (no Tailwind) | See ADR-3. |
| Maps | Leaflet + react-leaflet, OpenStreetMap tiles | No API key needed. ADR-4. |
| Drag & drop | `@dnd-kit/core` | |
| Testing | Minitest (backend), Vitest + RTL (frontend) | |

Repository layout:

```
backend/     Rails API
frontend/    Vite React SPA
doc/         project.md, architecture.md
             (.claude/interaction/wend-mvp/ holds decisions.md, screens.md, status.md)
wend-design/ read-only design bundle (do not modify)
```

Ports: Rails on `:3000`, Vite on `:5173` with `/api` proxied to Rails.

---

## 2. Core data model

Everything is an **Entry**. The self-referencing M:M `EntryLink` join carries all
structure: trips contain ideas, ideas contain sub-ideas, bundles gather ideas.

### `users`
| column | type | notes |
| --- | --- | --- |
| id | integer PK | |
| name | string, not null | |
| email | string, not null, unique | |
| password_digest | string, not null | `has_secure_password` |
| created_at/updated_at | datetime | |

### `entries`
| column | type | notes |
| --- | --- | --- |
| id | integer PK | |
| kind | string, not null | `trip` \| `idea` \| `bundle` |
| title | string, not null | |
| description | text | |
| category | string | `place` `food` `activity` `lodging` `transport` `other`. Null for trip/bundle. |
| starts_on | date | trips: optional trip dates |
| ends_on | date | |
| location_name | string | e.g. "Nanzen-ji" |
| address | string | |
| lat | decimal(10,6) | |
| lng | decimal(10,6) | |
| duration_minutes | integer | planning estimate |
| source_url | string | collection mode: the Instagram/blog link |
| notes | text | |
| from_entry_id | integer FK entries | transport only: origin |
| to_entry_id | integer FK entries | transport only: destination |
| created_by_id | integer FK users, not null | |
| archived_at | datetime | **soft-hide only — never destroy.** |
| created_at/updated_at | datetime | |

Indexes: `kind`, `category`, `created_by_id`, `archived_at`, `[lat, lng]`.

**Never hard-delete an Entry.** Principle 1 is "nothing is discarded". `DELETE` on an
entry sets `archived_at`. Unlinking removes an `EntryLink`, never the Entry.

### `entry_links` — the M:M self-reference
| column | type | notes |
| --- | --- | --- |
| id | integer PK | |
| parent_id | integer FK entries, not null | |
| child_id | integer FK entries, not null | |
| position | integer, not null, default 0 | ordering within parent |
| created_at/updated_at | datetime | |

Unique index on `[parent_id, child_id]`. Index on `child_id`.
A child may have **many** parents (Disneyland in three day-bundles). Cycles must be
rejected at the model level (`validate :no_cycles` — walk ancestors before saving).

### `trip_memberships` — who may see and change a trip
| column | type | notes |
| --- | --- | --- |
| id | integer PK | |
| trip_id | integer FK entries, not null | the `kind: "trip"` entry this grant is on |
| user_id | integer FK users, not null | |
| role | string, not null | `owner` \| `member` \| `viewer` |
| created_at/updated_at | datetime | `created_at` is the `added_at` the API returns |

`trip_id` is a FK to **`entries`, not to a `trips` table**, because there is no `trips`
table: a trip is an Entry with `kind: "trip"` (§3 rule 1). This follows `todos.trip_id`
and `schedule_items.trip_id`, which point at `entries` for the same reason.

Three indexes:

- Unique on `[trip_id, user_id]` — one role per person per trip. Its leading column also
  answers "who is on this trip", so a plain `trip_id` index would be redundant.
- `[user_id, role]` — the hot path runs the other way, "which trips can this user see",
  once on nearly every request; a composite starting at `user_id` answers it from the
  index alone.
- Unique on `trip_id` where `role = 'owner'` — exactly one owner per trip, held by the
  database rather than by a callback.

Access is granted on a trip and inherited downward: you may see an entry if it is
reachable from a trip you hold a grant on, or if it is yours and has no trip ancestor at
all (the library). Since an idea can sit under two trips, your effective role on it is the
**most permissive** grant across its trip ancestors. A trip with no owner would be
invisible to everyone, so removing the last owner is refused.

**The table is `trip_memberships`; the API resource is `collaborators`** (§4). They differ
on purpose — "membership" already means the derived entry-belongs-to-trip relationship in
this codebase (§3 rule 3), so the resource that names people had to be spelled
differently.

### `votes` — desire rating, multi-user
| column | type | notes |
| --- | --- | --- |
| id | integer PK | |
| entry_id | integer FK, not null | |
| user_id | integer FK, not null | |
| score | integer, not null | inclusive range **-2..2** |

Unique index `[entry_id, user_id]`. Score 0 is a valid "meh"; to withdraw a vote,
`DELETE` the vote row.

### `todos` — checklists
| column | type | notes |
| --- | --- | --- |
| id | integer PK | |
| title | string, not null | |
| entry_id | integer FK entries | nullable — the idea it hangs off |
| trip_id | integer FK entries | nullable — trip-level todo ("apply for visa") |
| done_at | datetime | |
| due_on | date | |
| position | integer, default 0 | |

At least one of `entry_id` / `trip_id` must be present.

### `schedule_items` — the hourly plan
| column | type | notes |
| --- | --- | --- |
| id | integer PK | |
| trip_id | integer FK entries, not null | |
| entry_id | integer FK entries | the idea or **bundle** being scheduled |
| chosen_entry_id | integer FK entries | when `entry_id` is a bundle of options, the one picked on the day |
| day | date, not null | |
| day_version_id | integer FK day_versions | the plan this placement belongs to. Nullable — see below. |
| starts_at_minutes | integer | minutes from midnight, 0..1439. Null = unscheduled that day. |
| ends_at_minutes | integer | |
| note | text | |
| position | integer, default 0 | ordering for same-time / unscheduled items |

Storing times as integer minutes avoids timezone grief entirely. The frontend formats
them as 24-hour `HH:MM`.

A schedule_item is a **placement, not a kept thing**: the Entry it points at is what the
user saved, and it outlives the placement. So unlike entries and day_versions, these rows
may be destroyed outright — unplacing something, or a trip's dates shrinking out from
under it, does exactly that, and nothing kept is lost.

`day_version_id` stays nullable so the older `POST /trips/:id/schedule` path, which sends
a bare `day`, cannot 500. The controller resolves the day's first live version on write,
so no live row is left without one.

### `trip_days` — a date the trip has put something on

| column | type | notes |
| --- | --- | --- |
| id | integer PK | |
| trip_id | integer FK entries, not null | |
| day | date, not null | |
| lodging_entry_id | integer FK entries | where you sleep that night, as a kept place |
| lodging_label | string | free text instead — "Sleeping on the plane" |
| created_at/updated_at | datetime | |

Unique index `[trip_id, day]`. A date with nothing on it has **no row**; the client merges
the trip's date range with what comes back. `lodging_entry_id` and `lodging_label` are
mutually exclusive in practice but not enforced — the API sends both plus a resolved
`lodging_title`, which prefers the entry's title.

### `day_versions` — alternate plans for the same day

| column | type | notes |
| --- | --- | --- |
| id | integer PK | |
| trip_day_id | integer FK trip_days, not null | |
| name | string, not null | "Version A", "Version B", … past Z, "Version AA" |
| position | integer, not null, default 0 | ordering within the day |
| archived_at | datetime | **archived = "not chosen, kept anyway" — never destroyed.** |
| created_at/updated_at | datetime | |

Same rule as entries: a version the user did not go with is archived, not deleted, so a
change of mind costs nothing. A day always keeps **at least one live version**; archiving
the last one is rejected with 422.

Model rules:

- `TripDay.ensure!(trip_id:, day:)` — find the row or create it along with the "Version A"
  every day is guaranteed to have. Every write path that takes a date goes through this.
- `TripDay#fork!` — duplicate the last live version: next letter (A → B → C, counted over
  every version the day has ever had, archived included), position at the end, plus a copy
  of every schedule_item in the source.
- `DayVersion#keep!` — this is the one. Archives every live sibling and renames the
  survivor back to "Version A" at position 0. A no-op when there is nothing to choose
  between.
- `DayVersion#restore!` — clears `archived_at`, appends at the end of the live list under
  the first letter nobody is using.
- `DayVersion#archive!` — sets `archived_at`; returns false rather than leaving a day with
  no live version.

### `feedbacks` — what users say about the app

Note this is the one table that is **not** about travel, and the one place a row is not
an Entry. See `.claude/interaction/wend-mvp/decisions.md` §8 for why it stays outside
the Entry graph.

| column | type | notes |
| --- | --- | --- |
| id | integer PK | |
| message | text, not null | max 5000 chars |
| user_id | integer FK users, not null | always the signed-in user, never the request body |
| url | string | the full **client** URL, e.g. `http://localhost:5173/trips/3/schedule` |
| element_selector | string | set only when the user pointed at something |
| element_classes | string | that element's class attribute, e.g. `_chip_7ilc4_44` |
| status | string, not null, default `new` | `new` \| `triaged` \| `done` |
| user_agent | string | captured from the request; **not serialized back** |
| created_at/updated_at | datetime | |

`element_classes` is dropped if `element_selector` is blank — classes alone point at
nothing. The selector is built from ids and `data-testid` only, never class names, which
are rehashed on every build; the class attribute is stored beside it as a *grep hint*
rather than a locator, since Vite keeps the authored name inside the hash (`.chip` →
`_chip_7ilc4_44`).

An element capture is three things we authored — a URL, a selector, a class attribute.
The human label the picker shows on screen ("the 'Set aside' button") is read from page
text, so it can contain whatever the user typed, and is deliberately **never sent**. The
only user-written text this table holds is `message`.

---

## 3. Domain rules

1. **A trip is an Entry with `kind: "trip"`.** It has no parent. Trip dates are optional.
2. **The library** = entries with `kind: "idea"` that have no `trip` ancestor. This is
   collection mode: saved inspiration not yet committed to a trip.
3. **`trip_id` is derived**, not stored on entries: an entry belongs to a trip if a
   `kind: "trip"` entry is among its ancestors. An idea can therefore be in two trips
   at once, which is intentional (reuse your research).
4. **Bundles** (`kind: "bundle"`) are entries too: a half-day outing, a draft day, a set
   of dinner options. They can be nested and duplicated.
5. **Lift out** (`POST /entries/:id/lift`): convert an idea into a `kind: "trip"` entry
   and detach it from its current parents. Its own children come with it.
6. **Absorb** (`POST /entries/:id/absorb`): fold trip B into trip A — B becomes
   `kind: "idea"` and gains A as a parent, keeping all of B's descendants.
7. **Fork** (`POST /entries/:id/fork`): shallow-duplicate a bundle (new bundle, same
   children linked). Lets two versions sit side by side.
8. **Scheduled vs potential**: an entry is "scheduled" if a `schedule_item` in that trip
   references it (directly or as a bundle member); otherwise "potential".

---

## 4. API surface

All routes under `/api`. JSON in, JSON out. Auth by signed session cookie.
Errors: `{ "errors": { "field": ["message"] } }` with 422, or `{ "error": "message" }`
with 4xx/5xx. All timestamps ISO 8601. All keys **snake_case**.

### Session
```
POST   /api/session          { email, password }        -> 201 { user }
DELETE /api/session                                     -> 204
GET    /api/me                                          -> 200 { user } | 401
POST   /api/users            { name, email, password }  -> 201 { user }  (signs in)
```

### Entries
```
GET    /api/entries
         ?kind=trip|idea|bundle
         &trip_id=<id>          entries anywhere under this trip
         &parent_id=<id>        direct children of this entry
         &category=food
         &unassigned=true       library only (no trip ancestor)
         &scheduled=true|false  requires trip_id
         &q=<search>
         &include_archived=true
       -> 200 { entries: [Entry] }

POST   /api/entries       { entry: {...}, parent_id? }  -> 201 { entry }
GET    /api/entries/:id                                 -> 200 { entry, parents, children, votes, todos }
PATCH  /api/entries/:id   { entry: {...} }              -> 200 { entry }  (kind is create-only: ignored here; use lift/absorb)
DELETE /api/entries/:id                                 -> 200 { entry }  (sets archived_at)
POST   /api/entries/:id/restore                         -> 200 { entry }

GET    /api/entries/:id/tree?depth=3                    -> 200 { entry, descendants: [Entry] }
POST   /api/entries/:id/lift                            -> 200 { entry }
POST   /api/entries/:id/absorb   { into_id }            -> 200 { entry }
POST   /api/entries/:id/fork                            -> 201 { entry }
```

**Moving a trip's dates moves its plan.** Placement is keyed by a real calendar date,
but "Day 2" is what the user planned — an offset from the start. So a PATCH that changes
`starts_on` shifts every `trip_day` and every `schedule_item` of the trip by
`new starts_on - old starts_on`, and Day 2 stays Day 2. A trip that had no `starts_on`
has nothing to preserve and nothing moves.

After the shift, any day outside `starts_on..ends_on` is **dropped**. Because that loses
placements, the attempt is its own preview: unless the body carries
`confirm_dropped_days: true` alongside `entry`, nothing at all is written and the response
is 422
```jsonc
{ "error": "dropped_days_need_confirmation",
  "dropped_days": ["2026-08-23", "2026-08-25"],  // ISO, ascending, post-shift
  "dropped_item_count": 5 }
```
`dropped_item_count` is how many **ideas go back to "Not placed yet"** — entries left with
no placement anywhere in the trip, counted once each — not how many `schedule_items` are
destroyed. An idea also placed on a day inside the new range stays placed and is not one
of them; nor is one that only a day's archived version holds, since it is already on the
rail. (`TripDateShift#dropped_entry_count`. The wire name is the older one.)
With confirmation, the shift and the removal happen in one transaction: the dropped days'
`schedule_items`, `trip_days` and `day_versions` are destroyed and the success shape is
the usual `{ entry }`. No Entry is touched, so those ideas reappear under "Not placed yet".
A PATCH that names neither date never drops anything, even a day that was already out of
range.

### Links
```
POST   /api/entries/:id/links     { child_id, position? }   -> 201 { link }
PATCH  /api/entries/:id/links/:child_id  { position }       -> 200 { link }
DELETE /api/entries/:id/links/:child_id                     -> 204
POST   /api/entries/:id/links/reorder { child_ids: [...] }  -> 200 { links }
```

### Votes
```
PUT    /api/entries/:id/vote   { score: -2..2 }   -> 200 { vote, tally }
DELETE /api/entries/:id/vote                      -> 204
```
`tally` = `{ total: Int, count: Int, average: Float, by_user: { user_id: score } }`.

### Todos
```
GET    /api/todos?trip_id=&entry_id=&done=true|false  -> 200 { todos: [Todo] }
POST   /api/todos      { todo: {...} }                -> 201 { todo }
PATCH  /api/todos/:id  { todo: {...} }                -> 200 { todo }
DELETE /api/todos/:id                                 -> 204
```
The unified checklist view is `GET /api/todos?trip_id=X` — it returns both trip-level
todos and todos hanging off any entry in the trip, each with `entry` summary attached.

### Schedule
```
GET    /api/trips/:trip_id/schedule?day=YYYY-MM-DD   -> 200 { schedule_items: [ScheduleItem] }
POST   /api/trips/:trip_id/schedule  { schedule_item: {...} }  -> 201
PATCH  /api/schedule_items/:id                                 -> 200
DELETE /api/schedule_items/:id                                 -> 204
```
`schedule_item` accepts `day_version_id` on both write paths. **Omit it and the item lands
on that day's first live version**, creating the `trip_day` and its "Version A" if this is
the first thing placed there — which is how the final-schedule screen, which knows nothing
about versions, keeps working unchanged. A PATCH that moves an item to another date and
does not name a version re-resolves it against the new date.

### Itinerary
```
GET    /api/trips/:trip_id/itinerary          -> 200 { trip_days: [TripDay] }
POST   /api/trips/:trip_id/itinerary/swap_days  { a: "YYYY-MM-DD", b: "YYYY-MM-DD" }
                                              -> 200 { trip_days: [TripDay] }   # whole trip, ascending
                                              -> 422 { error: "day_outside_trip" | "invalid_day" }

PATCH  /api/trips/:trip_id/days/:day          { trip_day: { lodging_entry_id?, lodging_label? } }
                                              -> 200 { trip_day: TripDay }
POST   /api/trips/:trip_id/days/:day/versions -> 201 { trip_day: TripDay }   # fork

POST   /api/day_versions/:id/keep             -> 200 { trip_day: TripDay }
POST   /api/day_versions/:id/restore          -> 200 { trip_day: TripDay }
DELETE /api/day_versions/:id                  -> 200 { trip_day: TripDay }   # archives
```
`:day` is `YYYY-MM-DD`, a date rather than an id, because until the first write there is
no `trip_day` row to address — both day routes create one on demand. `index` returns only
days that have a row. Every mutation answers with the **whole affected TripDay** so the
client replaces one day in its cache without a refetch race. Sending both lodging keys as
null clears the lodging.

`swap_days` is the exception that answers with the whole trip: "move Day 2 to be Day 3"
**exchanges** the two dates rather than pushing every later day along, and that renumbers
both. Everything the date owns travels — the `trip_day` row (so lodging and every version
go with it) and the `day` of each `schedule_item` on it. Either date may be empty; that
just moves the plan onto the empty date. Both dates must be inside `starts_on..ends_on`.

### Nearby (flexibility on the road)
```
GET /api/trips/:trip_id/nearby?lat=&lng=&radius_km=2&exclude_scheduled=true
  -> 200 { entries: [Entry with distance_km] }
```
Haversine in SQL. This powers "I have free time here, what's nearby but unscheduled".

### Collaborators (who is on a trip)
```
GET    /api/trips/:trip_id/collaborators                     -> 200 { collaborators: [Collaborator], my_role }
POST   /api/trips/:trip_id/collaborators  { email, role }    -> 202 { "status": "accepted" }
PATCH  /api/trips/:trip_id/collaborators/:user_id { role }   -> 200 { collaborator }
DELETE /api/trips/:trip_id/collaborators/:user_id            -> 204
POST   /api/trips/:trip_id/collaborators/:user_id/hand_over  -> 200
```
`Collaborator` = `{ user_id, name, email, role, is_you, added_at }`. Everyone sees names;
`email` is `null` unless the caller is an owner or a member, so a shared trip does not
become an address book. On write, `role` is `member` or `viewer` only — `owner` is
rejected, because a second owner cannot be minted, only handed over. A member may remove
themselves; only an owner may remove anyone else, and an owner must hand the trip on
before leaving it.

`POST` answers **`202 { "status": "accepted" }`, byte for byte, whether or not the email
matched an account** — and equally when the person is already on the trip or is you. 202 is
the honest status: 201 would claim something was created when often nothing was. No email
is ever sent, and an address matching no account does nothing. The errors give nothing away
either, because each is about the caller rather than about who exists: `401` not signed in,
`404` the trip is not visible to you, `403` you are a viewer on a trip you can already see,
`422` the email is blank or malformed or the role is not `member`/`viewer`. The `403` is the
one place a refusal is named as such, and it is safe there precisely because it tells you
only what you already know — everything outside what you can see is a `404` (ADR-5).

The rows behind this resource are `trip_memberships` (§2); the resource is named
`collaborators` because "membership" is already taken.

### Feedback
```
GET    /api/feedbacks?limit=50            -> 200 { feedbacks: [Feedback] }
POST   /api/feedbacks  { feedback: {...} } -> 201 { feedback }
```
`index` returns **only the caller's own** feedback, newest first (`.claude/interaction/wend-mvp/decisions.md` §8);
`limit` is clamped to 1..200. On `create` the writable fields are `message`, `url`,
`element_selector` and `element_classes` — `user_id`, `status` and `user_agent` are set
from the request and ignored if supplied in the body.

### Serializer shapes

`Entry` (list form):
```json
{
  "id": 12, "kind": "idea", "title": "Nanzen-ji",
  "description": null, "category": "place",
  "starts_on": null, "ends_on": null,
  "location_name": "Nanzen-ji", "address": "…", "lat": 35.0116, "lng": 135.7681,
  "duration_minutes": 40, "source_url": null, "notes": null,
  "from_entry_id": null, "to_entry_id": null,
  "archived_at": null, "created_at": "…", "updated_at": "…",
  "children_count": 0, "todos_open_count": 2,
  "vote_tally": { "total": 3, "count": 2, "average": 1.5 },
  "my_vote": 2,
  "scheduled": false,
  "my_role": null
}
```

`my_role` is your role on **this trip** — `owner` \| `member` \| `viewer` — and is `null`
on ideas and bundles, which inherit their trip's role rather than carrying one. Access is
uniform over a subtree by construction, so children need no field of their own. It is
filled by one bulk lookup per list, never one query per row.

`Entry` (detail form) adds `parents: [EntrySummary]`, `children: [Entry]`,
`todos: [Todo]`, `votes: [Vote]`, and `collaborators_count: Int` — how many people are on
the trip, so the header can say who is here without fetching the list.
`EntrySummary` = `{ id, kind, title, category, duration_minutes, location_name }` — one
shared shape, sent by entry `parents`, `Todo#entry` and the itinerary's `entry`/`members`.
It carries no role.

The itinerary sends three more:

```jsonc
TripDay = {
  id, trip_id,
  day: "2026-10-12",
  lodging_entry_id: number | null,
  lodging_label: string | null,
  lodging_title: string | null,     // resolved: entry.title, else lodging_label, else null
  versions: [DayVersion],           // live only, by position
  archived_versions: [DayVersion]   // archived_at desc
}

DayVersion = {
  id, trip_day_id, name, position,
  archived_at: string | null,
  schedule_items: [ItineraryItem]   // by starts_at_minutes, then position
}

ItineraryItem = {
  id, trip_id, entry_id, chosen_entry_id, day, day_version_id,
  starts_at_minutes: number | null,
  ends_at_minutes: number | null,
  note: string | null,
  position: number,
  entry: EntrySummary | null,
  members: [EntrySummary]           // [] unless entry.kind == "bundle"; link position order
}
```

---

## 5. Design system implementation

The design bundle at `wend-design/project/` is **read-only reference**. Port it into
`frontend/src/design/`:

- Copy `tokens/*.css` verbatim into `frontend/src/design/tokens/`.
- Copy `assets/*.svg` into `frontend/public/brand/`.
- Port `components/core/{Button,Chip,Input}.jsx` and `components/brand/{Logo,Trail}.jsx`
  to TypeScript in `frontend/src/design/components/`, replacing inline `style` objects
  with CSS modules or a plain co-located stylesheet using the same token values. Visual
  output must be identical.

### Non-negotiable brand rules (from `readme.md` + `Wend Design System.dc.html`)

- **No shadows anywhere.** Elevation is paper `#F0F3EE` vs card `#FBFCFA` tone.
- **Apricot `#E89A5E` is never text.** It is a ring, a 3px focus outline, an underline.
  It means exactly one thing: *this is where you are deciding now*.
- Focus is **always** a 3px apricot outline at 3px offset. Every interactive element.
- Borders 1.5px, or 2px when the border carries an action.
- Type: Atkinson Hyperlegible everywhere, DM Mono only for codes/coordinates/counters.
  Minimum 15px. Body measure 60–70ch. **No italics for emphasis — use bold.**
- Spacing on a 4px base: 8 · 12 · 16 · 24 · 32 · 48 · 64. Screen gutter 20px,
  list rows 12px apart, sections 48px. Inside a group the gap is the divider.
- Tap targets ≥ 48×48 on touch, never below 32×32 for pointer.
- Imagery: the `--placeholder-hatch` diagonal, **never a grey box**.
- Motion: the trail draws forward dot-by-dot, 420ms ease-out; reverse plays at the same
  speed. Everything else is a 160ms opacity change. No bounce, no scale, no spring.
  Honour `prefers-reduced-motion` (tokens already collapse to 0ms).
- States: hover/press are **opacity only** — the palette never lightens or darkens.
  Nothing is ever struck through or greyed to mean "rejected", because nothing is
  rejected.
- Icons: no icon set ships. Use Lucide at 1.5px stroke when needed.

### Voice

Second person, short sentences, plain words, sentence case. Buttons are verbs of
movement — "Widen again", "Keep both for now". Placeholders ask a
plain question: "Where are you going?" not "Destination". Never urgent, never scarce.
No exclamation marks. 24-hour times (`09:40`), en-dash ranges (`10:15–11:40`), middot
separators (`morning · east`).

Copy to use for empty states:
- Library, empty: "Nothing kept yet. Saving something is how a trip starts."
- Trip with no ideas: "This one's still a blank canvas. Add the first thing you'd like to do."
- Schedule with nothing placed: "Nothing placed yet. Drag something over from your ideas."

### The trail is the only navigation metaphor

Trip progress uses `<Trail>`: **Brainstorm → Gather → Schedule**. Stops are `decided`
(solid green), `open` (apricot ring — the step you're on), `waiting` (pale). Selecting a
completed stop returns to that step with everything you kept.

---

## 6. Frontend routes

| Route | Screen | Priority |
| --- | --- | --- |
| `/` | Trips list + library summary | P0 |
| `/trips/:id` | Planning board — idea tree, filters, bundles, votes | P0 |
| `/trips/:id/map` | Map view, filter scheduled vs potential | P1 |
| `/trips/:id/schedule` | Hourly day plan | P1 |
| `/trips/:id/checklist` | Unified todo view | P1 |
| `/library` | Collection mode: all unassigned ideas, map, select → new trip | P1 |
| `/entries/:id` | Detail panel (drawer over the board) | P0 |
| `/signin` | Sign in / sign up | P0 |

Planning surfaces are **desktop-first** (comparing, regrouping, side-by-side).
The schedule and checklist are **mobile-first** (read while walking, bright sun, large
type, high contrast). The finished day plan is the one dark surface in the product.

---

## 7. Build order

- **Phase 1** — Backend foundation: Rails app, schema, models, auth, type checking, seeds.
- **Phase 2** — Frontend foundation: Vite app, design system port, API client, auth, shell.
- **Phase 3** — Entries API + planning board (P0).
- **Phase 4** — Map, schedule, checklist, library (P1).
- **Phase 5** — Integration pass, seed demo data, README.

Phases 1 and 2 run in parallel — they touch disjoint directories.

---

## Decision records

**ADR-1 · SQLite over Postgres.** No local Postgres and no `psql` client on this
machine. Rails 8 ships SQLite as a production-capable default. All queries stay
portable ANSI-ish SQL; the Haversine `nearby` query uses plain arithmetic, not PostGIS,
so a later Postgres migration is a `database.yml` change plus a data copy.

**ADR-2 · Sorbet first, RBS + Steep as fallback.** The brief says "enable type check".
Sorbet gives stronger inference and better Rails support via Tapioca. Ruby 4.0.3 is very
new, so if `sorbet-static` will not install or `srb tc` cannot parse Ruby 4.0 syntax,
fall back to RBS + Steep (ships with Ruby). Either way `bin/typecheck` must exist and exit
0. Outcome: Sorbet + Tapioca worked; see `.claude/interaction/wend-mvp/decisions.md` §4.

**ADR-3 · Plain CSS with tokens, no Tailwind.** The design bundle is expressed as CSS
custom properties. A utility framework would fight the tokens and invite off-scale
values. Plain CSS keeps the token file the single source of truth.

**ADR-4 · Leaflet + OSM.** No API key, no billing, no signup — the app runs for anyone
who clones it. Google Maps can be swapped in behind the same `<MapView>` component
later if the user wants richer place data.

**ADR-5 · Pundit for authorization, and 404 in place of 403.** Every endpoint has to ask
the same question — what is this person's role on the entries this record hangs off — so
the answer needed one home rather than a `current_user` check repeated through 31
controller actions. Pundit gives that: plain Ruby policy objects, no DSL and no implicit
callbacks, and a `verify_authorized` after-action that turns "somebody forgot to check" from
a silent leak into a failing test. It was preferred to CanCanCan, whose single ability class
grows into a conditional thicket as roles multiply, and to hand-written `before_action`
filters, where nothing enforces that the filter was written at all. The role itself is
resolved once from a record's governing entries, so no policy re-derives the rule.

**Anything outside what you can see is 404, never 403.** A 403 confirms the trip exists,
which makes trip ids enumerable and undoes the feature — "visible only to me and the people
I shared it with" has to cover the fact of the trip, not just its contents. So an
authorization failure renders the same not-found response as a missing record, and finds go
through the visible scope rather than being checked after the fact. A 403 survives only
where the caller can already see the resource and is merely too junior to act on it, such as
a viewer trying to add someone (§4); there it reveals nothing new.

**One limitation is known and accepted.** Adding someone by email answers the same 202
whether or not the address matched an account, but `GET /collaborators` shows the added
person a moment later, so a determined caller can still learn that an account exists by
reloading. The POST response is ambiguous; the feature is not. This was ruled UX politeness
rather than a security property, and pending-invisibility — hiding a fresh grant from the
list until the other person appears — was deliberately not built: it adds a second, weaker
state to the model in exchange for slowing an attack this product does not defend against.
Timing parity on the POST is best-effort for the same reason: one code path, both branches
doing the same round trips, and no artificial sleeps, which burn a thread and make timing
analysis easier rather than harder.
