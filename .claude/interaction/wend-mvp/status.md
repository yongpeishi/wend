# Wend — Status

Where the MVP stands, how to run it, and what is still unverified.
`decisions.md` records why things are the way they are; `screens.md` is the UX spec.

**Branch:** `worktree-wend-mvp`, in the worktree at `.claude/worktrees/wend-mvp`.

---

## The MVP is built

Every screen in `screens.md` exists and is wired to the real API. No route is a
placeholder. What remains is verification and polish, not construction.

**Tree state: green**, verified at the latest commit:

| Check | Result |
| --- | --- |
| `bin/rails test` | 83 tests, 287 assertions, 0 failures |
| `bin/typecheck` (Sorbet) | clean |
| `npm test` | 167 tests across 35 files, all passing |
| `npm run build` | succeeds |

| Piece | State |
| --- | --- |
| Rails API — full surface in `doc/architecture.md` §4 | Done, verified live; idempotent seeds |
| Design system port (tokens byte-identical, 5 components) | Done |
| Component kit (16 components) + `/design` gallery | Done |
| Typed API client + TanStack Query hooks + MSW mocks | Done |
| Auth, routing, app shell, `TripLayout` trip shell | Done |
| `src/lib/formatDates.ts` house formatting | Done |
| `/` home — trips + library strip | Done |
| `/trips/:id` planning board | Done |
| `/trips/:id/map` — brand pins, clustering, filters | Done |
| `/trips/:id/schedule` — hourly plan, dark surface, nearby | Done |
| `/trips/:id/checklist` — unified todos | Done |
| `/entries/:id` detail drawer | Done |
| `/library` — synced split view, "Take these somewhere" | Done |

**Contract drift check: passed.** The real Rails API's JSON keys were compared against
`src/api/types.ts` on every endpoint (entries list, entry detail, votes, schedule items,
todos). They match exactly, including the `{ entry, parents, children, todos, votes }`
top-level sibling shape for entry detail. The MSW mocks are a faithful reimplementation,
not a divergent one.

---

## Running it

```bash
cd backend  && bin/rails db:setup && bin/rails server   # :3000
cd frontend && npm install && npm run dev               # :5173
```

Vite proxies `/api` to Rails, so **Rails must be running**. MSW mocks are opt-in — set
`VITE_USE_MOCKS=true` only for standalone design work such as `/design`.

Sign in as `sarah@example.com` or `peter@example.com`, both `password123`.

## What to do first

1. **Open `/design`.** Nobody has ever seen this rendered — see gap 1.
2. **Walk the core flow** against the real API: home → open the Japan trip → add an idea →
   drag it onto a bundle → vote → open the map → place something on the schedule → check
   the checklist. This is the end-to-end pass that has not happened.

A `bin/dev` or root `package.json` script that boots both servers together would be a
worthwhile convenience.

---

## Known gaps and risks

1. **No visual verification has ever happened.** No browser was ever connected. Tokens are
   byte-identical to the design bundle and a brand audit found zero shadows, zero italics,
   zero emoji and zero hardcoded hex outside the token files — but nobody has looked at a
   rendered pixel. Open `/design` first thing.
2. **No end-to-end click-through has happened.** Key shapes are verified to match (see the
   contract check above), but nobody has driven the real app against the real API through
   a browser.
3. **`Drawer` has no focus trap.** `Modal` has one — it focuses the first control in its
   body, yields to an explicit `autoFocus`, and wraps Tab/Shift+Tab at both ends, covered
   by `src/components/Modal.test.tsx`. `Drawer` shares `Overlay.module.css` but only calls
   `panelRef.current?.focus()`. Porting the same logic across is the remaining piece.
4. **`MapView` has no render test.** jsdom cannot lay out a real Leaflet map, so its logic
   (clustering, bounds, pin state, geocoding throttle) is unit-tested separately and the
   route tests mock the component. The map's actual rendering is unverified.
5. **Nominatim coverage is the known weak point** of the free maps stack, and it bites
   hardest on exactly the case that started this project — finding individual Daiso
   branches in Japan. Manual pin-drop and pasted coordinates always work. If adding places
   is tedious in practice, swapping to a keyed provider is a two-file change
   (`decisions.md` §3).
6. **Ancestor walks are recursive.** Fine at seed scale; if a trip with hundreds of entries
   feels slow, add a materialised closure table rather than caching in the UI.
7. **Overnight schedule items and timezone-crossing flights cannot be expressed** in one
   row. A 23:00–01:00 item must be split across two days.
8. **Sorbet runs at default `typed: false`** — syntax and constant resolution only, not
   full inference. App files carry no `# typed:` sigil. Adding `sig`s and raising files to
   `typed: true` is real future work.
