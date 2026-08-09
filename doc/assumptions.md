# Assumptions log

Every judgement call made without you in the room. Newest at the bottom.
Anything marked **↩ reversible cheaply** can be changed late without a rewrite.

Open questions live in `.claude/interaction/Q_*.md`.

---

### A0 · Auth model — **CONFIRMED by the user (Q1 → option a)**
Email + password accounts, signed session cookie, trips shared by default among all
signed-in users, no invite flow or permissions model in the MVP. Votes are keyed by
`user_id` so multi-user voting works at the data layer from day one.

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
