# Wend — Decisions

Why the MVP is the way it is: scope, stack, data model, and the readings that the contract
in `doc/architecture.md` left open. `screens.md` is the UX spec; `status.md` is the current
state.

Decisions marked **↩ reversible cheaply** can be changed late without a rewrite.

---

## 1. Scope

### In

- Accounts, sign in, seeded demo data
- Entries: create / edit / archive, all six categories, location, notes, source URL
- The self-referencing tree: trips contain ideas contain sub-ideas; ideas sit in many parents
- Bundles: drag ideas in and out, fork a bundle, compare two side by side
- Desire voting −2..+2, per user, with tallies
- Todos on entries and on trips, plus the unified per-trip checklist
- Map view with scheduled-vs-potential filter
- Hourly day schedule, with "options" bundles resolved on the day
- Nearby: free time here → what's unscheduled within 2 km
- Library / collection mode, and creating a trip from selected library ideas
- Lift an idea out into its own trip; absorb one trip into another

### Out

- **Photo upload — cut, not deferred.** The `--placeholder-hatch` diagonal is the final
  treatment for entry imagery, not a stand-in. Entries carry `source_url` as their only
  external reference. Do not build upload affordances or design around future photos.
- **Import from Instagram / TikTok / Maps links.** Paste a URL, title it yourself.
- **Offline / PWA.**
- **Transport routing and live times.** Transport is an Entry between two Entries with a
  duration you type. No API lookups.
- **A dedicated trip-option compare screen.** Trip options are sibling `kind: "trip"`
  entries; bundle-vs-bundle compare on the planning board covers the side-by-side need.
- **Undo/redo, activity log, notifications, export/print.**

## 2. Auth and collaboration

Email + password with a signed session cookie. A trip is private to the people who hold a
grant on it. Grants live in `trip_memberships` — a row of trip, user and role, where the
role is **Owner**, **Member** or **Viewer**. The Owner started the trip; only they can
delete it, change what someone else may do, or hand the trip on. A Member can add, change
and rearrange everything inside it, and bring others along. A Viewer reads it and leaves it
as they found it. Exactly one Owner per trip, enforced by an index. No realtime.

You can see an entry if it is reachable downward from a trip you hold a grant on, or if it
is yours and hangs under no trip at all — the library case. An idea can sit in two trips, so
your effective role on one is the most permissive grant across its trip ancestors.

Sharing is by email address, and no email is sent. If the address belongs to an account, the
trip is waiting for that person the next time they sign in; if it belongs to nobody, nothing
happens. The response is the same either way, because saying which one happened would answer
"does this person have an account here" to anyone who asks. For the same reason anything
outside what you can see answers **404, not 403** — a 403 confirms the trip exists and makes
trip ids enumerable, which is the whole thing this is for.

Votes are keyed by `user_id`, so multi-user voting worked at the data layer from day one and
adding grants on top was additive rather than a rewrite: no vote, todo or schedule row
changed shape, and access is read off the entry tree that was already there.

**The table is `trip_memberships`; the API resource is `collaborators`.** They differ on
purpose — "membership" already means the derived entry-belongs-to-trip relationship here
(§5), so the resource that names people had to be spelled differently.

## 3. Maps

Leaflet + OpenStreetMap tiles for rendering, Nominatim for geocoding. No API key, no
billing — the app runs for anyone who clones it.

Accepted trade-off: Nominatim's coverage of small Japanese businesses is patchier than
Google's, and its policy caps requests at ~1/second. So geocoding is debounced to
≤1 request/second, and a failed geocode never blocks capturing an idea — a manually dropped
pin and pasted `lat, lng` are first-class paths.

**↩ reversible cheaply** — `features/map/MapView.tsx` and `features/map/markerIcon.ts` are
the only files importing Leaflet, and `features/map/geocode.ts` is the only geocoder, so a
keyed provider is a two-file swap. Keep `<MapView>` and `<PlaceSearch>` as clean seams.

## 4. Stack

**SQLite, not Postgres.** Rails 8 treats SQLite as production-capable, and this avoids a
server or Docker setup step. Queries stay portable; `nearby` uses plain Haversine
arithmetic rather than PostGIS. **↩ reversible cheaply** — a `database.yml` change plus a
data copy.

**Sorbet + Tapioca for type checking.** `tapioca init` / `tapioca dsl` generate gem and DSL
RBIs cleanly with `--parser=prism`. One suppression is needed in `sorbet/config`: Sorbet's
bundled stdlib payload for `net-imap` (pulled in transitively by Action Mailer, unused
here) disagrees with the `Gemfile.lock` version about two classes' superclass, fixed with
the two `--suppress-payload-superclass-redefinition-for=` lines Sorbet's own error message
suggests. A stdlib/gem-version mismatch, not an app bug. **↩ reversible cheaply** — RBS +
Steep (ships with Ruby) is the documented fallback.

**Plain CSS with design tokens, no Tailwind.** The design bundle is expressed as CSS custom
properties; a utility framework fights tokens and invites off-scale values.

**`vite.config.ts` and `vitest.config.ts` stay two files.** Vitest bundles its own nested
copy of `vite`; merging a `test` block into `vite.config.ts` (the documented single-file
pattern) produces a plugin-type conflict between the two `vite` instances under `tsc -b`,
so `npm run build` fails while `vite`/`vitest` commands are unaffected. **↩ reversible
cheaply** — re-merge if a future release fixes duplicate-package type resolution.

## 5. Data model

**Trip membership is derived, not stored.** An entry belongs to a trip if a `kind: "trip"`
entry is among its ancestors, rather than carrying a `trip_id` column. This is what makes
"reuse my research" work — one idea can sit in two trips at once. Cost: ancestor walks are
recursive queries, mitigated with a depth cap and eager loading. If it gets slow, add a
materialised closure table rather than caching in the UI. This is the *entry* sense of
membership — which trip a thing is in. Who may open that trip is a separate, stored thing:
the `trip_memberships` rows in §2, exposed as `collaborators` to keep the two apart.

**Bundles are Entries, not their own table.** `kind: "bundle"` reuses the entry tree
wholesale, so a bundle can be nested, forked, voted on, and given todos for free. Cost:
some columns (category, lat/lng) are always null on bundles.

**Nothing is hard-deleted.** `DELETE /api/entries/:id` sets `archived_at`; it never
destroys. Unlinking removes an `EntryLink` only. Archived entries are hidden by default on
`GET /api/entries`; `include_archived=true` shows both. There is no "only archived" filter
and no UI path that permanently destroys an Entry.

**Times are integer minutes from midnight.** `schedule_items.starts_at_minutes` /
`ends_at_minutes`, 0..1439, alongside a `day` date. This sidesteps timezone handling
entirely, which is what a traveller actually wants — 09:40 means 09:40 where you are
standing, not UTC-shifted. **Limitation:** an overnight item (23:00–01:00) must be split
across two days, and a flight crossing timezones cannot express "leaves 10:00 Tokyo, lands
09:00 London" in one row.

**Vote score 0 is a real value.** −2..+2 inclusive, where 0 means "no strong feeling".
Withdrawing a vote deletes the row, which is different from voting 0. The UI shows five
stops, not four.

**The library is "no trip ancestor".** An idea taken into a trip leaves the library
listing, and that is correct — the library *is* "kept, not yet in a trip". Nothing is
discarded: the entry is untouched, reachable under its trip, and still linkable into
further trips, since links are additive. "Take these somewhere" only ever POSTs links; it
never deletes, archives or detaches. `src/routes/Library.test.tsx` documents the
disappearance from the `unassigned=true` listing explicitly rather than leaving it to
prose. **↩ reversible cheaply** — to keep showing everything, change the `library` scope to
an explicit "set aside as inspiration" flag: a backend scope change plus a migration.

**Trail navigation is Brainstorm → Gather → Schedule**, mapped to the three layers of the
brief's core user flow. **↩ reversible cheaply** — labels are props.

**Seed data is a Japan trip plus a Malaysia trip.** Japan carries multiple Daiso branches
bundled as interchangeable options and a Kyoto day with dinner alternatives; Malaysia
carries Penang / Melaka / Bali as sibling ideas to exercise lift-out and absorb. Two users
so vote tallies show more than one voice. Seeds are idempotent.

## 6. API readings

Where `doc/architecture.md` left room, this is what was built.

**`GET /api/entries/:id` returns `{ entry, parents, children, votes, todos }` as top-level
siblings**, with `entry` itself in list form — the literal endpoint signature in §4, not the
nested reading implied by the serializer-shapes section. `EntrySerializer.detail` (nested
form) still exists and computes the same sub-parts; the controller flattens it.
**↩ reversible cheaply** — one line in `Api::EntriesController#show` plus one type change.

**"Scheduled" (§3 rule 8)** means some `schedule_item` has `entry_id == entry.id` (placed
directly, including a bundle placed as a whole) OR `chosen_entry_id == entry.id` (picked as
the option within a scheduled bundle). Where a `trip_id` is available, the check is scoped
to that trip's `schedule_items`; otherwise it is global.

**`fork` (§3 rule 7) re-parents the copy alongside the original.** "Lets two versions sit
side by side" means the new entry lands under the same parent(s) as the original, not just
carrying the same children. `fork` copies every column (title gets a " (copy)" suffix) and
duplicates both the child links (shallow — same child ids, positions preserved) and the
parent links. Not restricted to `kind: "bundle"`.

**`GET /api/entries?unassigned=true` overrides `kind`.** The library is ideas-only by
definition, so `unassigned=true` always applies the `library` scope regardless of any `kind`
param passed alongside it.

**Haversine `nearby` runs as one SQL query.** This SQLite build exposes `sqrt`, `sin`,
`cos`, `asin`, `atan2`, `radians` and `power` as SQL functions, so there is no Ruby-side
distance loop. One wrinkle: it rejects a bare `HAVING` outside an aggregate/`GROUP BY` query
even when it only filters a `SELECT` alias, so the distance filter is applied in an outer
`WHERE` around a subquery. See `app/controllers/api/nearby_controller.rb`.

Everything else matches §2/§4 exactly — table and column names, endpoint paths, and JSON key
names including `vote_tally`, `my_vote`, `children_count`, `todos_open_count`.

## 7. Component readings

Where the design bundle left room.

**`Chip` and `Tag` are two components.** The prototype rendered both an interactive filter
toggle and a static "Saved · 12" label through one component. `Chip` is a real `<button>`
with `aria-pressed`; `Tag` is a `<span>` with no interaction — a static label that is
focusable and clickable but does nothing is an accessibility bug, not a style choice. Both
share the same CSS module.

**No error or red colour exists in the token set.** `colors.css` has no warning/error hue,
and apricot is reserved for "where you are now". Form validation errors render in bold
`--text-strong`, never colour-coded. `Toast`'s tone is carried by a left accent bar only,
reusing existing meanings (`success` → leaf/`--stop-decided`, `error` →
plum/`--stop-destination`) rather than inventing a hue.

**Modal and Drawer overlays are a solid fill, not a translucent scrim.** The only
translucent value in the system is `--focus-ring-wash`, so the overlay is
`background: var(--surface-page)` at full opacity. Separation from the page comes from card
tone plus a drawn border — "no shadows, no blur/transparency" read literally rather than by
convention.

**`VoteControl` has no source in the design bundle.** Built to read without a legend by
mirroring `Trail`'s own idiom: dot size grows with distance from neutral, a single
leaf-green fill marks the current vote regardless of sign (no negative hue exists in the
palette), and each stop's accessible name — e.g. "Really want this" — carries the meaning
for screen readers.

**`Spinner` is three dots with staggered 160 ms opacity fades, not a rotating spinner.** The
motion vocabulary is exhaustive: the trail's dot-by-dot draw, and "everything else is a
160 ms opacity change — no bounces, no scale, no spring." A rotate is not one of the two
named motions.

## 8. Feedback

**Feedback is its own table, not an Entry.** Everything in this app is an Entry, so the
obvious move was to make feedback one more `kind`. It was rejected. An Entry is travel
content: it can be voted on, linked into bundles, lifted into its own trip, scheduled at
09:00 and shown on a map. None of that is meaningful for a bug report, and every one of
those code paths would have to grow a "...unless it's feedback" branch. The Entry graph
earns its generality by everything in it obeying the same rules; feedback obeys none of
them. So `feedbacks` is a flat table with a `user_id`, touching nothing else.
**↩ reversible cheaply** — nothing else reads the table, so it can be folded into `entries`
(or dropped) with one migration.

**You can read your own feedback, nobody else's.** `GET /api/feedbacks` is scoped to the
signed-in user. Who may read the whole pile is a real product question — this app has no
admin role and the seeded users are peers, so any answer inventing one would be a guess.
Scoping to the author cannot be wrong, and keeps the endpoint useful (the composer can show
you what you already said). Triage lives in the `status` column (`new` / `triaged` /
`done`), which the API deliberately does **not** let the reporter set; there is no update
endpoint yet, so status changes happen in the console. **↩ reversible cheaply** — an admin
flag on `users` plus a branch in `FeedbacksController#index`.

**The feedback button sits bottom-left.** The toast stack owns bottom-right, and a button
that transient messages slide over is unpressable at exactly the moment something just went
wrong. **↩ reversible cheaply** — one CSS module.

**Element selectors use id / data-testid / nth-child only, never class names.** CSS Modules
hash class names at build time, so a class-based selector would be dead on the next deploy.

**A capture stores the page URL and the element's class attribute — not its label.** The
picker can read a human name for whatever you point at ("the 'Set aside' button"), and that
name is what a report *reads* best. But it comes from the page's own text, so pointing at a
trip title, a note or a filled-in input would post that text back to us — nobody typed it
into a feedback box, they typed it into their trip. So the label is computed for the
on-screen affordance only and never leaves the browser, and the durable reference is two
things we wrote ourselves: the full URL and the class attribute. Under Vite the class keeps
its authored name inside the hash (`.chip` → `_chip_7ilc4_44`), so it greps back to source —
a breadcrumb, not a locator, since the hash moves when the stylesheet changes. The full URL
is safe for the same reason: this app has no query-string state, so a URL is pure routing.
**↩ reversible cheaply** — `describeElement` already computes the label; sending it is one
field in `FeedbackComposer`. If query params ever carry user text, revisit storing the whole
URL.
