# Q3 — Where the MVP line sits

**Status:** answered by assumption, not blocking. This is the one most worth your eyes.

Your brief describes a complete product. I've drawn the MVP line to cover the whole
spine of the core flow — daydream → ideas → bundles → hourly plan — rather than
polishing any one stage. Here's what's in and what's deliberately out.

## In

- Accounts, sign in, seeded demo trip (Japan, with Daiso branches as a bundle)
- Entries: create / edit / archive, all six categories, location, notes, source URL
- The self-referencing tree: trips contain ideas contain sub-ideas; ideas in many parents
- Bundles: drag ideas in and out, fork a bundle, compare two side by side
- Desire voting −2..+2, per user, with tallies
- Todos on entries and on trips, plus the unified per-trip checklist
- Map view with scheduled-vs-potential filter
- Hourly day schedule, with "options" bundles you resolve on the day
- Nearby: free time here → what's unscheduled within 2km
- Library / collection mode, and creating a trip from selected library ideas
- Lift an idea out into its own trip; absorb one trip into another

## Out (deliberately, for now)

- **Sharing and invites** — see Q1
- **Offline / PWA** — the "read it on the road" case really wants this eventually
- **Photo upload** — the design system ships a hatch placeholder and no photography;
  entries carry a `source_url` instead
- **Import from Instagram / TikTok / Maps links** — your collection-mode use case names
  Instagram specifically. Real unfurling of a share link is a scraper project of its
  own. MVP: paste a URL and title it yourself.
- **Transport routing / live times** — transport is modelled as an Entry between two
  Entries with a duration you type. No API lookups.
- **Trip-option comparison at layer 1** — your brief mentions comparing whole trip
  options with pros and cons before committing. MVP models these as sibling trip-kind
  entries with descriptions; there's no dedicated side-by-side compare screen.
- **Undo/redo**, activity log, notifications, export/print

## The calls I'd most like you to overrule if you disagree

1. **Instagram import is out.** If saving from Instagram is the actual daily habit that
   makes this app stick, it deserves to be in and something else should go.
2. **Offline is out.** Every other feature is useless if the app is blank on a Kyoto
   street with no signal. I judged it too big for MVP, but it's the one omission that
   could undercut the whole "on the road" half of the product.
3. **No dedicated compare screen** for trip options, even though "compare trip options:
   brief description, pros cons" is written explicitly in your core flow.

**Answer here:**

