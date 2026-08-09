# Handoff — remaining work

**Branch:** `worktree-wend-mvp`, in the worktree at `.claude/worktrees/wend-mvp`.
**Tree state: green.** `npm run build`, `npm run typecheck`, `npm test` (84), and
`bin/rails test` (83) + `bin/typecheck` all pass at the latest commit.

Pick this up by reading `doc/architecture.md` (the contract) and `doc/screens.md` (the
UX spec). Those two plus this file are enough to continue without re-deriving anything.

---

## What is done

| Piece | State |
| --- | --- |
| Rails API — full surface in architecture.md §4 | **Done, verified live.** 83 tests, Sorbet clean, idempotent seeds |
| Design system port (tokens byte-identical, 5 components) | **Done** |
| Component kit (16 components) + `/design` gallery | **Done** |
| Typed API client + TanStack Query hooks + MSW mocks | **Done** |
| Auth, routing, app shell, `TripLayout` trip shell | **Done** |
| `src/lib/formatDates.ts` house formatting | **Done** |
| `/trips/:id` planning board | **Done** |
| `/trips/:id/schedule`, `/trips/:id/checklist` | **Logic done, routes not wired** — see below |
| `/`, `/entries/:id`, `/trips/:id/map`, `/library` | **Placeholders only** |

Three screen agents were interrupted mid-build by a session limit. Their partial work is
committed and compiles; nothing is half-written on disk.

---

## Remaining tasks, in priority order

### 1. Wire the schedule route — *cheapest win, logic already exists*

`src/routes/TripSchedule.tsx` is still a 14-line placeholder, but its whole feature
folder is written and tested:

- `features/schedule/scheduleModel.ts` — `daysForTrip`, `itemsForDay`, `sortDayItems`,
  `unplacedIdeas`, `isTransportItem`, `entryFor`, `addDays`, `DATELESS_ANCHOR`
  (8 tests passing)
- `features/schedule/` components — `DayColumn`, `ScheduleBlock`, `OptionsBlock`,
  `TransportSegment`, `UnscheduledTray`, `PlaceAtModal`, `useGeolocation`

**To do:** compose these in `TripSchedule.tsx`. Get the trip via
`useOutletContext<{ trip: Entry }>()`, data via `useSchedule(trip.id)` and
`useEntries({ trip_id })`, render day tabs → `DayColumn` → tray, and wire
"What's around here?" to `useGeolocation` + `useNearby`.
`TripLayout` **already applies the dark inverted surface** for this tab, so use
`--text-on-dark` / `--text-on-dark-muted` and the `onDark` component variants.

### 2. Wire the checklist route — *also cheap*

`features/checklist/checklistModel.ts` is written and tested (`splitDoneOpen`,
`sortOpenTodos`, `isEntryScheduled` — 6 tests). Compose in `TripChecklist.tsx`:
`useTodos({ trip_id })` already returns trip-level **and** entry-level todos with an
`entry` summary attached. Open items first sorted by due date then by whether their
entry is scheduled; done items collapse into `Done · 6`, **dimmed by opacity, never
struck through**. Add box with an optional "for…" entry picker. Paper surface, not dark.

### 3. `/` — Home (`TripsList.tsx`)

Per `screens.md` § Home. Trip cards (title, dates or `NO DATES YET`, a count line,
a `Trail` showing progress), plus the **"Kept, not yet in a trip"** library strip with a
link to `/library`. Primary action "Start something" creates a trip from a title alone.
Use `useEntries({ kind: 'trip' })` and `useEntries({ unassigned: true })`.

### 4. `/entries/:id` — Detail drawer (`EntryDetail.tsx`)

Per `screens.md` § Detail drawer. Editable title, description, category, location,
duration, source URL, notes; then parents ("appears in"), children, `VoteControl` with
per-user breakdown, todos, and the actions **Lift out of trip** and **Set aside**.
Hooks all exist: `useEntry`, `useUpdateEntry`, `useLiftEntry`, `useArchiveEntry`,
`useVote`, `useTodos`. `Drawer` component exists.

### 5. `/trips/:id/map` and `/library` — *nothing built yet*

The map agent was interrupted before writing any file. Full spec in `screens.md`.
`leaflet` + `react-leaflet` are installed but **never imported yet** — expect the usual
bundler marker-icon issue; you are drawing custom SVG stop-circle markers anyway.

Requirements that are easy to miss:
- Pin state uses the trail vocabulary: solid leaf green = scheduled, pale = potential,
  plum = destination/lodging. **Apricot ring marks the selected pin only.**
- Colour must never carry meaning alone — state the status in the popover text too.
- Override Leaflet's popup shadow and radius: **no shadows anywhere**, 6px card radius.
- Cluster dense pins **without adding a dependency** (simple grid clustering is fine).
- `/library`: split map+list kept in sync; selecting entries → **"Take these somewhere"**
  creates a trip and **links** the ideas — they must **stay in the library too**.
- Keep `<MapView>` / `<PlaceSearch>` as clean seams (A0c) so a keyed provider can be
  swapped in without touching call sites.
- Debounce Nominatim to ≤1 request/second; a failed geocode must never block capturing
  an idea — manual pin-drop and pasted `lat, lng` are first-class paths.

### 6. Integration pass

- Run the frontend against the **real Rails API** rather than MSW mocks (`npm run dev`
  with `bin/rails server` up) and click the core flow end to end. The MSW layer is a
  reimplementation of the API and is the most likely place for a silent contract drift.
- Visually check `/design` in a browser — **this has never been done.** See Known gaps.
- Consider a `bin/dev` or root `package.json` script that boots both servers together.

---

## Known gaps and risks

1. **No visual verification has ever happened.** The Chrome extension was not connected
   for any agent or for the coordinator. Tokens are byte-identical to the design bundle
   and a brand audit found zero shadows, zero italics, zero emoji and zero hardcoded hex
   outside the token files — but **nobody has looked at a rendered pixel.** Open
   `/design` first thing.
2. **The frontend has mostly been exercised against MSW, not Rails.** Both implement
   architecture.md §4, but only the backend is the real thing. Do the integration pass.
3. **`Modal`/`Drawer` have no focus-trap loop** — Escape and initial focus work, but Tab
   can escape the dialog. Worth fixing before anyone calls this accessible.
4. **Ancestor walks are recursive** (A4). Fine at seed scale; if a trip with hundreds of
   entries feels slow, add a materialised closure table rather than caching in the UI.
5. **Overnight schedule items and timezone-crossing flights cannot be expressed** in one
   row (A6). A 23:00–01:00 item must be split across two days.
6. **Sorbet runs at default `typed: false`** — syntax and constant resolution only, not
   full inference. Adding `sig`s and raising files to `typed: true` is real future work.

---

## Conventions worth keeping

- **Never hard-delete.** Archive is called "Set aside" in the UI; every scope offers a
  way to pick it back up. There is no destroy path.
- **Filters hide, never remove** — always render the `Showing N of M · widen again`
  escape next to any narrowing.
- **Dragging into a bundle copies the link**, never moves the idea; the source row stays
  visibly in place.
- **Every drag needs a keyboard equivalent.** Drag is an accelerator, never the only path.
- Use `src/lib/formatDates.ts` for every time, date, duration and distance. Never
  hand-roll: house style is 24-hour times, en-dash ranges, middot metadata.
- Voice: second person, short, plain, sentence case, no exclamation marks, no emoji.
  Buttons are verbs of movement. Never auto-rank by vote score — this is a voting
  system, not an optimiser.
