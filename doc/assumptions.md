# Assumptions log

Every judgement call made without you in the room. Newest at the bottom.
Anything marked **↩ reversible cheaply** can be changed late without a rewrite.

Open questions live in `.claude/interaction/Q_*.md`.

---

> **All three open questions are answered. Q1 → (a), Q2 → (a), Q3 → see A0b.**
> Every answer matched the assumption already in place, so nothing below was reworked.

### A0 · Auth model — **CONFIRMED by the user (Q1 → option a)**
Email + password accounts, signed session cookie, trips shared by default among all
signed-in users, no invite flow or permissions model in the MVP. Votes are keyed by
`user_id` so multi-user voting works at the data layer from day one.

### A0b · Scope cuts — **CONFIRMED by the user (Q3)**
- **No photo upload, ever** — not deferred, cut. The `--placeholder-hatch` diagonal is the
  final treatment for entry imagery, not a stand-in. Entries carry `source_url` as their
  only external reference. Do not build upload affordances or design around future photos.
- **Instagram / social import: out.** Paste a URL, title it yourself.
- **Offline / PWA: out.**
- **No dedicated trip-option compare screen.** Trip options are sibling `kind: "trip"`
  entries with descriptions; bundle-vs-bundle compare on the planning board covers the
  side-by-side need.

### A0c · Maps — **CONFIRMED by the user (Q2 → option a)**
Leaflet + OpenStreetMap tiles for rendering, Nominatim for geocoding. No API key, no
billing — the app runs for anyone who clones it. Accepted trade-off: Nominatim's coverage
of small Japanese businesses is patchier than Google's, and its policy caps requests at
~1/second, so geocoding is debounced and every entry also supports a manually dropped pin
or pasted coordinates. Keep `<MapView>` and `<PlaceSearch>` as seams so a keyed provider
can be swapped in later without touching call sites.

### A1 · SQLite, not Postgres
No Postgres server or `psql` client on this machine; Docker is available but adds a
setup step for you. Rails 8 treats SQLite as production-capable. Queries stay portable;
the `nearby` search uses plain Haversine arithmetic rather than PostGIS.
**↩ reversible cheaply** — `database.yml` change plus a data copy.

### A2 · Sorbet for type checking, RBS + Steep as fallback
"Enable type check" in the brief. Sorbet has stronger Rails support via Tapioca. Ruby
4.0.3 is very new, so if `sorbet-static` won't install or can't parse Ruby 4.0 syntax,
the backend falls back to RBS + Steep (ships with Ruby). Either way `bin/typecheck`
exists and exits 0. **Actual outcome recorded by the backend agent below.**

### A3 · Plain CSS with design tokens, no Tailwind
The design bundle is expressed as CSS custom properties. A utility framework fights
tokens and invites off-scale values.

### A4 · Trip membership is derived, not stored
An entry belongs to a trip if a `kind: "trip"` entry is among its ancestors, rather than
carrying a `trip_id` column. This is what makes "reuse my research" work — one idea can
sit in two trips at once. Cost: ancestor walks are recursive queries. Mitigated with a
depth cap and eager loading; if it gets slow, add a materialised closure table.

### A5 · Nothing is hard-deleted
Principle 1 of the design system is "nothing is discarded". `DELETE /api/entries/:id`
sets `archived_at`; it never destroys. Unlinking removes an `EntryLink` only. There is
no UI path that permanently destroys an Entry in the MVP.

### A6 · Times stored as integer minutes from midnight
`schedule_items.starts_at_minutes` / `ends_at_minutes`, 0..1439, alongside a `day` date.
Sidesteps timezone handling entirely for a hand-authored plan, which is what a traveller
actually wants — 09:40 means 09:40 where you're standing, not UTC-shifted.
**Limitation:** an overnight item (23:00–01:00) must be split across two days, and a
flight crossing timezones can't express "leaves 10:00 Tokyo, lands 09:00 London" in one
row. Flagged for you rather than solved.

### A7 · Bundles are Entries, not their own table
`kind: "bundle"` reuses the entry tree wholesale, so a bundle can be nested, forked,
voted on, and given todos for free. Cost: some columns (category, lat/lng) are always
null on bundles.

### A8 · Vote score 0 is a real value
−2..+2 inclusive, where 0 means "no strong feeling". Withdrawing a vote deletes the row,
which is different from voting 0. The UI shows five stops, not four.

### A9 · Trail navigation = Brainstorm → Gather → Schedule
The design system says the trail is the only navigation metaphor but doesn't fix the
stops. I mapped them to the three layers in the brief's core user flow.
**↩ reversible cheaply** — labels are props.

### A10 · Seed data is a Japan trip
Built around the brief's own examples: multiple Daiso branches bundled as
interchangeable options, a Kyoto day with dinner alternatives, and a Malaysia trip with
Penang / Melaka / Bali as sibling ideas to exercise lift-out and absorb. Two users so
vote tallies show more than one voice.

---

## Recorded by implementation agents

<!-- Agents append here: what you assumed, why, and what it would cost to change. -->

### Backend agent · Phase 1

**A2 outcome: Sorbet + Tapioca, no fallback needed.** Ruby 4.0.3 was not a
problem — `tapioca init` (which drives `srb rbi` under the hood) and
`tapioca dsl` generated gem/DSL RBIs cleanly with `--parser=prism`, and
`srb tc` passed with zero errors once one thing was suppressed: Sorbet's own
bundled stdlib payload for `net-imap` (pulled in transitively via Action
Mailer, unused by this app) disagrees with the `net-imap` gem version in
`Gemfile.lock` about two classes' superclass. Fixed with the two
`--suppress-payload-superclass-redefinition-for=...` lines Sorbet's own error
message suggested, in `sorbet/config` — a stdlib/gem-version mismatch, not an
app bug. `bin/typecheck` runs `bundle exec srb tc` and exits 0. App files
carry no `# typed:` sigil (so they type-check at Sorbet's default "false"
strictness — syntax and constant resolution, not full inference); adding
`sig`s and bumping files to `true` is future work, not required for this
phase. **↩ reversible cheaply** — RBS + Steep remains the documented fallback
if Sorbet ever becomes a problem on a later Ruby, but wasn't needed here.

**`GET /api/entries/:id` response shape.** §4 has two descriptions that
don't quite agree: the endpoint line says `-> 200 { entry, parents, children,
votes, todos }` (four keys as siblings of `entry`), while the serializer-shapes
section says "Entry (detail form) adds `parents`, `children`, `todos`,
`votes`" (implying they nest inside the `entry` object). I implemented the
literal endpoint signature — top-level siblings, `entry` itself in list form
— since that's the more concrete, copy-pasteable line and avoids a
frontend dev having to guess between two different places the same data
might live. `EntrySerializer.detail` (nested form) still exists and computes
the same sub-parts; the controller just flattens it. **↩ reversible cheaply**
— it's a one-line change in `Api::EntriesController#show` if the frontend
agent already built against the nested reading.

**"Scheduled" (§3 rule 8).** Defined an entry as scheduled when some
`schedule_item` has `entry_id == entry.id` (placed directly, including a
bundle placed as a whole) OR `chosen_entry_id == entry.id` (picked as the
option within a scheduled bundle). When a `trip_id` is available (the
`GET /api/entries?trip_id=` filter, or any endpoint naturally scoped to one
trip), the check is scoped to that trip's `schedule_items` only; otherwise
it's global. This is the reading that makes "bundle member" concrete without
guessing at UI-only state.

**Haversine `nearby` — verified in SQL.** This SQLite build (via the
`sqlite3` gem, confirmed both from the `sqlite3` CLI and from
`ActiveRecord::Base.connection.select_value`) exposes `sqrt`, `sin`, `cos`,
`asin`, `atan2`, `radians`, and `power` as SQL functions, so the full
Haversine formula runs as one query, no Ruby-side distance loop. One wrinkle:
this SQLite rejects a bare `HAVING` clause that isn't inside an
aggregate/`GROUP BY` query, even when it only filters a `SELECT` alias — so
the distance filter is applied in an outer `WHERE` around a subquery instead
of a `HAVING` directly on the computed column. See
`app/controllers/api/nearby_controller.rb`.

**`fork` (§3 rule 7) re-parents the copy alongside the original.** "Lets two
versions sit side by side" was read as: the new entry should land under the
same parent(s) the original has, not just carry the same children. So `fork`
copies every column (title gets a " (copy)" suffix), duplicates the child
links (shallow — same child ids, new positions preserved), and also
duplicates the parent links. Not restricted to `kind: "bundle"` even though
the prose example is a bundle — forking a plain idea works the same way,
since nothing in the contract says it shouldn't.

**`POST /api/entries?unassigned=true` overrides `kind`.** The library is
ideas-only by definition, so `unassigned=true` always applies the `library`
scope (which already filters to `kind: idea`) regardless of what `kind` param
was also passed, rather than erroring or silently ignoring one.

**Archived entries are hidden by default on `GET /api/entries`.** Not stated
explicitly in §4, but "soft-hide only" (§2) reads as intending exactly that
— a default list view showing archived rows alongside live ones would defeat
the point of archiving. `include_archived=true` shows both; there's no
"only archived" filter since nothing in the contract calls for one.

**Everything not covered above was implemented as written** — table/column
names, endpoint paths, and JSON key names match §2/§4 exactly, including
`vote_tally`, `my_vote`, `children_count`, `todos_open_count`. No endpoint
from §4 was skipped.

### Frontend agent · Phase 2

**Typed `GET /api/entries/:id` against the backend agent's confirmed
behaviour, not the ambiguous §4 prose.** The backend agent's entry above
flags that §4 reads two ways and records what was actually built: `{ entry,
parents, children, votes, todos }` as top-level siblings of `entry` (list
form), not a merge into `entry`. `EntryDetailResponse` in
`frontend/src/api/types.ts` and the `useEntry` hook are typed against that
reading. **↩ reversible cheaply** — one type change if the backend's shape
ever moves to match the other reading instead.

**Chip vs. Tag split.** The prototype's `Chip.jsx` renders both an
interactive filter toggle and the static "Saved · 12" tag through one
component. Ported as two: `Chip` (a real `<button>`, `aria-pressed`) and
`Tag` (a `<span>`, no interaction) — a static label that's focusable and
clickable but does nothing is a real accessibility bug, not a style choice.
**↩ reversible cheaply** — both share the same CSS module.

**No error/red colour exists in the token set.** `colors.css` has no
warning/error hue — apricot is reserved for "where you are now" and can't be
repurposed. Form validation errors (`Field`, sign-in) render in bold
`--text-strong`, never colour-coded. `Toast`'s tone is carried by a left
accent bar only, reusing existing meanings (`success` → leaf/`--stop-decided`,
`error` → plum/`--stop-destination`) rather than inventing a new hue.

**Modal/Drawer overlay is a solid fill, not a translucent scrim.**
`wend-design/project/readme.md` states the only translucent value in the
system is `--focus-ring-wash`. A conventional dimmed backdrop would add a
second one, so the overlay is `background: var(--surface-page)` at full
opacity — separation from the page underneath comes from card tone plus a
drawn border, matching "no shadows, no blur/transparency" literally rather
than by convention.

**VoteControl (−2..+2 desire rating) has no source in the design bundle.**
Built it to "read without a legend" per the brief by mirroring `Trail`'s own
idiom: dot size grows with distance from neutral (strength of feeling), a
single leaf-green fill marks the current vote regardless of sign (no second
"negative" hue exists in the palette), and each stop's accessible name (e.g.
"Really want this") carries the meaning for screen readers.

**Spinner is three dots with staggered 160ms opacity fades, not a rotating
spinner.** The brief's motion section is exhaustive: the trail's dot-by-dot
draw, and "everything else is a 160ms opacity change... no bounces, no
scale, no spring." A spin/rotate animation isn't one of the two named
motions, so the loading affordance is built from the one primitive the
system actually defines.

**`frontend/vite.config.ts` and `vitest.config.ts` are two files, not
one.** Vitest bundles its own nested copy of `vite`; merging a `test` block
into `vite.config.ts`'s `defineConfig()` (the documented single-file
pattern) produces a plugin-type conflict between the two `vite` package
instances under `tsc -b` (`npm run build` fails, `vite`/`vitest` dev/test
commands are unaffected since they don't type-check). Splitting the configs
resolves it; noted here since it deviates from the usual one-config-file
Vite convention. **↩ reversible cheaply** — re-merge if a future
Vite/Vitest release fixes the duplicate-package type resolution.

**No live browser was available to visually verify `/design`.** This
environment has no Chrome extension connected. Verified instead via
`DesignGallery.test.tsx` (renders every section through React Testing
Library, interacts with the modal trigger) and `npm run build` / `npm run
dev` + `curl` against the running server. Flagged in
`frontend/README.md#known-gaps` — worth a real visual pass before shipping.
