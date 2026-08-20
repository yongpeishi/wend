# Wend — Screen specifications

The UX spec for every screen. The design bundle ships brand identity and primitives only —
product structure is defined here, not inferred from that repository. Read alongside
`doc/architecture.md` (the data and API contract) and its §5 brand rules. `decisions.md`
records why things are the way they are; `status.md` records what is built.

**The three principles decide every argument:**

1. **Nothing is discarded.** Narrowing hides, never deletes. Every view has a way back to
   the wider one. If you are about to write a "delete" button, write "set aside" instead.
2. **Grouping is the mechanic.** Anything groupable ungroups just as cheaply. Any group
   forks. Two versions sit side by side until someone decides.
3. **Legible before lovely.** Times, platforms, addresses read in bright sun, in a hurry.

---

## `/` — Home

Desktop-first. Two regions, no dashboard clutter.

**Trips.** Card grid. Each card: title, date range if set (`14–22 Mar` en-dash) or the label
`NO DATES YET`, a count line (`nine places kept · two bundles`), and a `Trail` showing which
of Brainstorm / Gather / Schedule the trip has reached. Card-tone on paper-tone — no shadow,
no border needed.

**Library strip.** Below the trips: "Kept, not yet in a trip" with the six most recent
library ideas as `EntryRow`s and a link to `/library`. This is the bridge into the
inspiration→trip flow, so it must be visible on first load, not hidden behind a tab.

Primary action: **"Start something"** → new trip. A trip needs only a title; dates are
optional and stay optional.

Empty: "No trips yet. A trip can start as one word — a country, a season, a craving."

---

## `/trips/:id` — The planning board (the heart of the app)

Desktop-first, three columns. This is where "entering all the ideas for this trip" lives.

```
┌─────────────┬───────────────────────────────┬──────────────┐
│  Tree       │  Ideas                        │  Bundles     │
│  (nav)      │  (the working surface)        │  (grouping)  │
└─────────────┴───────────────────────────────┴──────────────┘
```

**Header.** Trip title (inline-editable, `Display 40/1.2`), dates, and `TrailNav`
(Brainstorm → Gather → Schedule) as the only navigation. Sub-tabs: Ideas · Map · Schedule ·
Checklist.

**Left — the tree.** The entry hierarchy: `Japan > Kyoto > Nanzen-ji`. Selecting a node
scopes the middle column to that node's subtree, which is how an intermediate layer gets
introduced: `Bali > Ubud/Seminyak/Canggu > things to do`. Nodes expand and collapse. Drag a
node onto another to re-parent. The trip root is always present at the top — the way back to
the wider view that principle 1 demands.

**Middle — ideas.** `EntryRow` list of the scoped subtree. Each row: hatch thumbnail, title,
`category · location · duration` in middots, `VoteControl`, open-todo count, keep toggle.
Rows are 12px apart, grouped by category with 48px between groups and no rules — the gap is
the divider.

Above the list: a filter bar of `Chip`s — category, "has location", "scheduled" vs
"potential", and a text search.

Add box pinned at the top: a single `Input`, placeholder **"What else would you like to
do?"**, `↵` hint. Type, Enter, the idea exists. One field — category and location are edited
afterward in the drawer. The cost of capturing an idea must be near zero, because that is
the whole point of collection mode.

Multi-select via checkbox or shift-click enables the bulk bar: *Add to bundle · Lift out ·
Set aside*.

**Right — bundles.** A bundle is a bucket of ideas that goes together — a half-day outing,
or a draft multi-day itinerary. Each bundle is a card: name, member count, member chips, and
a drop zone. Drag ideas from the middle column onto a bundle to add. An idea can be in many
bundles at once, so **dragging copies the link, never moves the idea** — and the source row
stays visibly in place so this is obvious.

Per bundle: **Fork** (duplicate to compare two versions), **Compare** (two bundles side by
side), **Ungroup** (removes links, keeps every idea). Ungroup must be exactly as easy to
reach as group — principle 2.

Empty: "This one's still a daydream. Add the first thing you'd like to do."

---

## `/entries/:id` — Detail drawer

Slides over the board. Title, description, category picker, location (address + map pick),
duration, source URL, notes. Then: parents ("appears in"), children, `VoteControl` with
per-user breakdown, todo list, and the actions **Lift out of trip** and **Set aside**.

---

## `/trips/:id/map` — Map view

Leaflet, OSM tiles. Pins for every entry in the trip with coordinates.

- Pin state uses the trail vocabulary: **solid leaf green** = scheduled, **pale** =
  potential, **plum** = a destination/lodging anchor. An apricot ring marks the selected pin
  only — "where you are deciding". The status is also stated in the popover text, because
  colour never carries meaning alone.
- Filter chips: scheduled · potential · by category.
- Clicking a pin opens a compact `EntryRow` popover with the keep toggle and a link into the
  drawer.
- **Cluster** dense pins with simple grid clustering — no extra dependency; clicking a
  cluster zooms.
- Bounds fit to the trip's entries on load.
- Leaflet's own popup shadow and radius are overridden: no shadows anywhere, 12px card
  radius. Markers are custom SVG stop-circles, which also sidesteps the bundler marker-icon
  problem.

This screen also answers "filter ideas by location" — zoom to a region and the board's middle
column follows the map bounds.

---

## `/trips/:id/schedule` — The hourly plan

**Mobile-first.** This is the on-the-road surface: large type, high contrast, read while
walking. The finished day plan is the one dark surface in the product — deep leaf `#2F4A36`
background, `--text-on-dark`. `TripLayout` applies the inverted surface for this tab, so use
`--text-on-dark` / `--text-on-dark-muted` and the `onDark` component variants.

**Day tabs** across the top (`Mon 16` · `Tue 17` …), derived from trip dates; if the trip has
no dates, days are `Day 1`, `Day 2`.

**The day column.** Hours down the left in 24-hour `HH:MM`, `Data` type (17px, 0.04em
tracking) — the type that has to survive bright sun. Scheduled items as blocks sized by
duration. Between two consecutive located items, a **transport slot**: an Entry of category
`transport` with its duration, drawn as a dotted trail segment between the two blocks.
Transportation is an Entry between two other Entries, and the dotted line is the brand's one
figure doing real work.

**Options blocks.** When a `schedule_item` points at a *bundle*, the block shows all its
members as choices — five options for day 1 dinner, one chosen on the day. Tapping one sets
`chosen_entry_id`; the others stay visible, dimmed by opacity only, never struck through.
The choice is reversible with one tap.

**Unscheduled tray.** A drawer at the bottom holding the trip's ideas not yet placed. Drag up
into the day. On mobile, a long-press + "Place at…" fallback, because drag on a phone is
fragile.

**Nearby.** A button — **"What's around here?"** — calls `/nearby` with the device location
and lists unscheduled ideas within 2km, sorted by distance. Show distance as `400 m` /
`1.2 km`, plain.

Empty: "Nothing placed yet. Drag something over from your ideas."

---

## `/trips/:id/checklist` — Unified checklist

Mobile-first, paper surface. One list, two sources:

- **Trip-level todos** — "apply for visa", not tied to any idea
- **Entry todos** — "make booking", "check opening time", each showing its parent entry as a
  quiet subtitle

Group by: open first, then done (done collapse into a "Done · 6" section, dimmed by opacity,
never struck through). Sort open items by due date, then by whether their entry is scheduled
— because a booking for tomorrow matters more than one for next week.

Add box: single input, plus an optional "for…" entry picker.

Empty: "Nothing to check off. That's either very good or very early."

---

## `/library` — Collection mode

Desktop-first. All ideas with no trip ancestor — "I saw something cool and want to save it",
"I have leave accumulated but don't know where to go."

- **Split view**: map on one side, list on the other, kept in sync — hovering a row
  highlights its pin, panning the map filters the list.
- **Zoom to a cluster → "Start a trip from these nine".** This is the inspiration→trip flow
  and the screen's reason to exist. Selecting entries (by map region, by chip filter, or by
  hand) enables one button: **"Start a trip with these"** → creates a trip with the selected
  ideas linked into it.
- Those ideas then leave the library listing, which is correct: the library *is* "kept, not
  yet in a trip". Nothing is discarded — see `decisions.md` §5.
- Quick-add box that accepts a pasted URL: store it as `source_url` and let the user title it.

Empty: "Nothing kept yet. Saving something is how a trip starts."

---

## Cross-cutting

These rules hold on every screen.

**Lift and absorb.** Two flows that must both be reachable:
- *Lift*: an idea in a trip becomes its own trip. From the drawer: "Lift out of trip" —
  "Penang can wait for another time. It's a trip of its own now."
- *Absorb*: fold one trip into another. From the trip header: "Bring another trip into this
  one" → picker → the absorbed trip becomes an idea under this one, keeping all its children.

**Set aside, never delete.** Archiving is called "set aside" throughout. Every scope has a
"Set aside · 4" affordance that reveals archived items with a one-tap "Pick it back up".
There is no destroy path in the UI.

**Filters hide, never remove.** Any narrowing renders its own escape next to it:
`Showing 9 of 31 · See all`, where "See all" clears the filters. (The escape used to read
"widen again"; it names its outcome now — see **Voice** below.)

**Voting.** `VoteControl` shows the current user's own vote plainly and the party's tally
quietly beside it (`+3 · 2 voices`). Never rank a list by score automatically — this is a
voting system, not an optimiser, and the voice guide rejects "optimise". If sorting by score
is ever wanted, it should be an explicit user action, never a default.

**Formatting.** Use `src/lib/formatDates.ts` for every time, date, duration and distance.
Never hand-roll: house style is 24-hour times, en-dash ranges, middot metadata.

**Voice.** Second person, short, plain, sentence case. No exclamation marks, no emoji.
Buttons name the outcome in ordinary words — "Save trip", "Remove them", "Start a trip with
these". Movement verbs are the counter-example, not the rule: "Take the long way", "Widen
again" and "Keep both for now" are headings and confirmations, never labels, because nobody
should have to press a button to find out what it does. Copy sitting *on* a control is
literal; copy sitting *beside* one may wander.

**Loading and errors.** 160ms opacity fades. No skeletons that shift layout. Errors are plain
and forgiving: "That didn't save. It's still here — try again."

**Accessibility.** Focus visible on everything (3px apricot, 3px offset). Tap targets ≥48×48
on touch. Every drag interaction needs a keyboard and pointer-free equivalent — drag is an
accelerator, never the only path. Colour never carries meaning alone: the keep toggle is
filled vs ringed *and* labelled, pin state is stated in the popover text too.
