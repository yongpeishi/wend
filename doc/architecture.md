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
| starts_at_minutes | integer | minutes from midnight, 0..1439. Null = unscheduled that day. |
| ends_at_minutes | integer | |
| note | text | |
| position | integer, default 0 | ordering for same-time / unscheduled items |

Storing times as integer minutes avoids timezone grief entirely. The frontend formats
them as 24-hour `HH:MM`.

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
PATCH  /api/entries/:id   { entry: {...} }              -> 200 { entry }
DELETE /api/entries/:id                                 -> 200 { entry }  (sets archived_at)
POST   /api/entries/:id/restore                         -> 200 { entry }

GET    /api/entries/:id/tree?depth=3                    -> 200 { entry, descendants: [Entry] }
POST   /api/entries/:id/lift                            -> 200 { entry }
POST   /api/entries/:id/absorb   { into_id }            -> 200 { entry }
POST   /api/entries/:id/fork                            -> 201 { entry }
```

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

### Nearby (flexibility on the road)
```
GET /api/trips/:trip_id/nearby?lat=&lng=&radius_km=2&exclude_scheduled=true
  -> 200 { entries: [Entry with distance_km] }
```
Haversine in SQL. This powers "I have free time here, what's nearby but unscheduled".

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
  "scheduled": false
}
```

`Entry` (detail form) adds `parents: [EntrySummary]`, `children: [Entry]`,
`todos: [Todo]`, `votes: [Vote]`.
`EntrySummary` = `{ id, kind, title, category }`.

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
- Radii: cards 6px, media 14px, buttons/chips full pill, stops/toggles circles,
  phone surfaces 22px. Borders 1.5px, or 2px when the border carries an action.
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
- Icons: no icon set ships. Use Lucide at 1.5px stroke only where a true utility icon is
  unavoidable (back, close, map pin), in `--text-strong` or `--text-muted`.
  **No emoji, ever.** `↵` in inputs is the one permitted Unicode affordance.

### Voice

Second person, short sentences, plain words, sentence case. Buttons are verbs of
movement — "Take the long way", "Widen again", "Keep both for now". Placeholders ask a
plain question: "Where are you going?" not "Destination". Never urgent, never scarce.
No exclamation marks. 24-hour times (`09:40`), en-dash ranges (`10:15–11:40`), middot
separators (`morning · east`).

Copy to use for empty states:
- Library, empty: "Nothing kept yet. Saving something is how a trip starts."
- Trip with no ideas: "This one's still a daydream. Add the first thing you'd like to do."
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
