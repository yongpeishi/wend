# Wend — Status

What is built, what is unverified, and what is known to be wrong.
`decisions.md` records why things are the way they are; `screens.md` is the UX spec.

---

## The MVP is built

Every screen in `screens.md` exists and is wired to the real API. No route is a
placeholder. What remains is verification and polish, not construction.

That covers the Rails API, the design-system port and component kit, the typed API client
with TanStack Query hooks and MSW mocks, auth and routing, and all seven routes — home,
planning board, map, schedule, checklist, entry drawer, library.

**Contract drift check: passed.** The Rails API's JSON keys were compared against
`src/api/types.ts` on every endpoint (entries list, entry detail, votes, schedule items,
todos). They match exactly, including the `{ entry, parents, children, todos, votes }`
top-level sibling shape for entry detail. The MSW mocks are a faithful reimplementation,
not a divergent one.

For how to run it, see `scripts/README.md`. Tree state is whatever `scripts/test` and
`scripts/lint` say right now — run them rather than trusting a number written here.

## What to verify first

1. **Open `/design`** — the component gallery, and the fastest way to catch a visual
   regression across the whole kit at once.
2. **Walk the core flow** against the real API: home → open the Japan trip → add an idea →
   drag it onto a bundle → vote → open the map → place something on the schedule → check
   the checklist.

---

## Known gaps and risks

1. **Visual verification is thin.** Tokens are byte-identical to the design bundle and a
   brand audit found zero shadows, zero italics, zero emoji and zero hardcoded hex outside
   the token files — but that is a static audit, not a look at rendered pixels.
2. **`Drawer` has no focus trap.** `Modal` has one — it focuses the first control in its
   body, yields to an explicit `autoFocus`, and wraps Tab/Shift+Tab at both ends, covered
   by `src/components/Modal.test.tsx`. `Drawer` shares `Overlay.module.css` but only calls
   `panelRef.current?.focus()`. Porting the same logic across is the remaining piece.
3. **`MapView` has no render test.** jsdom cannot lay out a real Leaflet map, so its logic
   (clustering, bounds, pin state, geocoding throttle) is unit-tested separately and the
   route tests mock the component. The map's actual rendering is unverified.
4. **Nominatim coverage is the known weak point** of the free maps stack, and it bites
   hardest on exactly the case that started this project — finding individual Daiso
   branches in Japan. Manual pin-drop and pasted coordinates always work. If adding places
   is tedious in practice, swapping to a keyed provider is a two-file change
   (`decisions.md` §3).
5. **Ancestor walks are recursive.** Fine at seed scale; if a trip with hundreds of entries
   feels slow, add a materialised closure table rather than caching in the UI.
6. **Overnight schedule items and timezone-crossing flights cannot be expressed** in one
   row. A 23:00–01:00 item must be split across two days.
7. **Sorbet runs at default `typed: false`** — syntax and constant resolution only, not
   full inference. App files carry no `# typed:` sigil. Adding `sig`s and raising files to
   `typed: true` is real future work.
