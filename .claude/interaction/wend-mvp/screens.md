# Wend — Screen specifications

The design bundle ships brand identity and primitives only. Its README says application
screens were removed deliberately *"so the app UX can be redesigned from scratch — do not
infer product structure from this repository."* This document is that redesign.

Every screen below is derived from the use cases in `doc/project.md` and constrained by
the brand rules in `doc/architecture.md` §5. Read both before building.

**The three principles decide every argument:**

1. **Nothing is discarded.** Narrowing hides, never deletes. Every view has a way back to
   the wider one. If you are about to write a "delete" button, write "set aside" instead.
2. **Grouping is the mechanic.** Anything groupable ungroups just as cheaply. Any group
   forks. Two versions sit side by side until someone decides.
3. **Legible before lovely.** Times, platforms, addresses read in bright sun, in a hurry.

---

## `/` — Home

Desktop-first. Two regions, no dashboard clutter.

**Trips.** Card grid. Each card: title, date range if set (`14–22 Mar` en-dash) or the
label `NO DATES YET`, a count line (`nine places kept · two bundles`), and a `Trail`
showing which of Brainstorm / Gather / Schedule the trip has reached. Cards are card-tone
on paper-tone — no shadow, no border needed.

**Library strip.** Below the trips: "Kept, not yet in a trip" with the six most recent
library ideas as `EntryRow`s and a link to `/library`. This is the bridge into the
inspiration→trip flow, so it must be visible on first load, not hidden behind a tab.

Primary action: **"Start something"** → new trip. A trip needs only a title; dates are
optional and stay optional (the brief's Malaysia example starts with no idea how long).

Empty: "No trips yet. A trip can start as one word — a country, a season, a craving."

---

## `/trips/:id` — The planning board (P0, the heart of the app)

Desktop-first, three columns. This is where the brief's second layer lives: *"Entering
all the ideas for this trip."*

```
┌─────────────┬───────────────────────────────┬──────────────┐
│  Tree       │  Ideas                        │  Bundles     │
│  (nav)      │  (the working surface)        │  (grouping)  │
└─────────────┴───────────────────────────────┴──────────────┘
```

**Header.** Trip title (inline-editable, `Display 40/1.2`), dates, and `TrailNav`
(Brainstorm → Gather → Schedule) as the only navigation. Sub-tabs: Ideas · Map ·
Schedule · Checklist.

**Left — the tree.** The entry hierarchy: `Japan > Kyoto > Nanzen-ji`. Selecting a node
scopes the middle column to that node's subtree. This is the brief's *"sometimes it makes
sense to introduce another layer in between: Bali > Ubud/Seminyak/Canggu > things to do."*
Nodes expand/collapse. Drag a node onto another to re-parent. The trip root is always
present at the top — that's the "way back to the wider view" the first principle demands.

**Middle — ideas.** `EntryRow` list of the scoped subtree. Each row: hatch thumbnail,
title, `category · location · duration` in middots, `VoteControl`, open-todo count, and
the keep toggle. Rows are 12px apart, grouped by category with 48px between groups and no
rules — the gap is the divider.

Above the list: a filter bar of `Chip`s — category, "has location", "scheduled" vs
"potential", and a text search. Filters **hide, never delete**, and the bar always shows
`Showing 9 of 31 · widen again` where "widen again" clears filters. Every narrowing
carries its own way out.

Add box pinned at the top: a single `Input`, placeholder **"What else would you like to
do?"**, `↵` hint. Type, Enter, the idea exists. One field — category and location are
edited afterward in the detail drawer. The cost of capturing an idea must be near zero,
because that's the whole point of collection mode.

Multi-select via checkbox or shift-click enables the bulk bar: *Add to bundle · Lift out ·
Set aside*.

**Right — bundles.** *"A bundle represents a bucket of ideas that goes together — a half
day outing, or a draft multi-day itinerary."* Each bundle is a card: name, member count,
member chips, and a drop zone. Drag ideas from the middle column onto a bundle to add.
An idea can be in many bundles at once, so dragging **copies the link, never moves the
idea** — and the source row must stay visibly in place so this is obvious.

Per bundle: **Fork** (duplicate to compare two versions), **Compare** (two bundles side by
side), **Ungroup** (removes links, keeps every idea). Ungroup must be exactly as easy to
reach as group — principle 2.

**Drawer — `/entries/:id`.** Slides over the board. Title, description, category picker,
location (address + map pick), duration, source URL, notes. Then: parents ("appears in"),
children, `VoteControl` with per-user breakdown, todo list, and the actions **Lift out of
trip** and **Set aside**. Card tone on paper tone, no shadow.

Empty: "This one's still a daydream. Add the first thing you'd like to do."

---

## `/trips/:id/map` — Map view (P1)

Leaflet, OSM tiles. Pins for every entry in the trip with coordinates.

- Pin state uses the trail vocabulary: **solid leaf green** = scheduled, **pale** =
  potential, **plum** = a destination/lodging anchor. Apricot ring marks the selected pin
  only — "where you are deciding".
- Filter chips: scheduled · potential · by category. Same "showing N of M · widen again"
  rule as the board.
- Clicking a pin opens a compact `EntryRow` popover with the keep toggle and a link into
  the drawer.
- **Cluster** dense pins; clicking a cluster zooms.
- Bounds fit to the trip's entries on load.

This screen also answers *"I want to filter ideas by location"* — draw or zoom to a
region, and the middle column of the board follows the map bounds.

---

## `/trips/:id/schedule` — The hourly plan (P1)

**Mobile-first.** This is the on-the-road surface: large type, high contrast, read while
walking. Per the design system, the finished day plan is the one dark surface in the
product — deep leaf `#2F4A36` background, `--text-on-dark`.

**Day tabs** across the top (`Mon 16` · `Tue 17` …), derived from trip dates; if the trip
has no dates, days are `Day 1`, `Day 2`.

**The day column.** Hours down the left in 24-hour `HH:MM`, `Data` type (17px, 0.04em
tracking) — this is the type that has to survive bright sun. Scheduled items as blocks
sized by duration. Between two consecutive located items, a **transport slot**: an Entry
of category `transport` with its duration, drawn as a dotted trail segment between the two
blocks. That's the brief's *"transportation info is an Entry between two other Entries"*,
and the dotted line is the brand's one figure doing real work.

**Options blocks.** When a `schedule_item` points at a *bundle*, the block shows all its
members as choices — *"the plan might indicate 5 options for day 1 dinner, I choose which
one to go on the day."* Tapping one sets `chosen_entry_id`; the others stay visible,
dimmed by opacity only, never struck through. The choice is reversible with one tap.

**Unscheduled tray.** A drawer at the bottom holding the trip's ideas not yet placed.
Drag up into the day. On mobile, a long-press + "Place at…" fallback, because drag on a
phone is fragile.

**Nearby.** A button — **"What's around here?"** — calls `/nearby` with the device
location and lists unscheduled ideas within 2km, sorted by distance. This is the brief's
*"when I have extra free time in an area, I want to see ideas outside the schedule but
nearby."* Show distance as `400 m` / `1.2 km`, plain.

Empty: "Nothing placed yet. Drag something over from your ideas."

---

## `/trips/:id/checklist` — Unified checklist (P1)

Mobile-first. One list, two sources, per the brief's *"I want a unified checklist view
that includes Entry in the itinerary"*:

- **Trip-level todos** — "apply for visa", not tied to any idea
- **Entry todos** — "make booking", "check opening time", each showing its parent entry as
  a quiet subtitle

Group by: open first, then done (done collapse into a "Done · 6" section, dimmed by
opacity, never struck through). Sort open items by due date, then by whether their entry
is scheduled — because a booking for tomorrow matters more than one for next week.

Add box: single input, plus an optional "for…" entry picker.

Empty: "Nothing to check off. That's either very good or very early."

---

## `/library` — Collection mode (P1)

*"I saw something cool on Insta and want to save the idea for inspiration."*
*"I have leaves accumulated but don't know where to go."*

Desktop-first. All ideas with no trip ancestor.

- **Split view**: map on one side, list on the other, kept in sync — hovering a row
  highlights its pin, panning the map filters the list.
- **Zoom to a cluster → "Start a trip from these nine"**. This is the brief's exact
  inspiration→trip flow and it is the screen's reason to exist. Selecting entries (by map
  region, by chip filter, or by hand) enables one button: **"Take these somewhere"** →
  creates a trip with the selected ideas linked into it.
- **What happens to those ideas afterwards.** They leave the library listing, and that is
  correct: the library *is* "kept, not yet in a trip", so an idea that is now in a trip no
  longer belongs to it. Nothing is discarded — the entry is untouched, still reachable
  under its new trip, and still linkable into further trips, because links are additive
  and an idea can serve two trips at once. Taking ideas somewhere **links, never moves**:
  the operation only ever POSTs a link, and never deletes, archives or detaches anything.
  An earlier draft of this document said the ideas "stay in the library too". That was
  wrong — it conflated *nothing is discarded* (true) with *stays in the unassigned list*
  (neither true nor desirable, since the library would then never empty).
- Quick-add box that accepts a pasted URL: store it as `source_url` and let the user title
  it. No unfurling in the MVP (see `.claude/interaction/Q_03`).

Empty: "Nothing kept yet. Saving something is how a trip starts."

---

## Cross-cutting

**Lift and absorb.** Two flows from the brief that must both be reachable:
- *Lift*: an idea in a trip becomes its own trip. From the drawer: "Lift out of trip" —
  "Penang can wait for another time. It's a trip of its own now."
- *Absorb*: fold one trip into another. From the trip header: "Bring another trip into
  this one" → picker → the absorbed trip becomes an idea under this one, keeping all its
  children. This is *"I have a Singapore trip drafted last time, I can combine it into the
  Malaysia trip."*

**Set aside, never delete.** Archiving is called "set aside" throughout. Every scope has a
"Set aside · 4" affordance that reveals archived items with a one-tap "Pick it back up".
There is no destroy in the UI.

**Voting.** `VoteControl` shows the current user's own vote plainly and the party's tally
quietly beside it (`+3 · 2 voices`). Never rank the list by score automatically — the
brief asks for a voting system, not an optimiser, and the voice guide explicitly rejects
"optimise".

**Loading and errors.** 160ms opacity fades. No skeletons that shift layout. Errors are
plain and forgiving: "That didn't save. It's still here — try again."

**Accessibility.** Focus visible on everything (3px apricot, 3px offset). Tap targets
≥48×48 on touch. Every drag interaction needs a keyboard and pointer-free equivalent —
drag is an accelerator, never the only path. Colour never carries meaning alone: the keep
toggle is filled vs ringed *and* labelled, pin state is shown in the popover text too.
