# Handover — View Trip page rework

Branch: `worktree-trip-view` (git worktree at `.claude/worktrees/trip-view`).
Written mid-task because the usage budget ran low. Everything below is verified
fact, not plan.

## Source of truth

`doc/backlog/trip-view.md` in the **main checkout** (`doc/backlog/` is gitignored,
so it is NOT in this worktree — read it from `/Users/peishiyong/code/wend`).
Five bullets. The design file is inspiration; the backlog wins on conflict.

Two clarifications the product owner gave in-session, both already applied:

1. **Grouping and filtering are orthogonal.** When grouped by location the user
   must still be able to filter by category. So category stays a *filter* (the
   `FilterBar` chips → `IdeaFilters.category`) and grouping is a separate axis.
   `groupByCategory` was kept as a mode, not deleted.
2. **Rating UI: "do whatever is easiest, separate iteration later."** Taken as
   board-only removal — `VoteControl` is dropped from the idea row, but
   `VoteControl.tsx` itself and voting on `EntryDetail` are untouched, so the
   later iteration still has everything.

## The design mockup

`ui-mockups-trip-view/project/Wend MVP.dc.html` in the main checkout (528K folder,
currently NOT gitignored — consider adding it, `doc/backlog/` already is).
987 lines. A `.dc.html` prototype: `sc-for` = loop, `sc-if` = conditional,
`{{ }}` = binding. Read for layout/type/colour, not as code to copy.

The only two regions that matter:

- **lines 173–267** — the board: filter row, "Group by place" toggle, count line,
  `+ New idea` button, the flat idea row, and the grouped/collapsible variant.
- **lines 268–297** — the right rail: intro paragraph, dashed drop box, bundle cards.

Note lines 269–273 are a rail tab strip (Bundles / Map / This idea) that the
backlog explicitly excludes — the rail is bundles-only and needs no tabs.
Subagents do **not** get the `DesignSync` MCP tool, so always point them at this
local path, never at the Claude Design project.

## Done and committed — `0e2b36c`

Verified green at commit time: `npm run typecheck` clean, `npm run lint` at the
3-warning baseline, `npm test` 226 passing.

- **Trip tablist moved to the sidebar.** `AppLayout.tsx` gained a PLAN block that
  renders only on trip routes (`useMatch('/trips/:id/*')` + `useMatch('/trips/:id')`,
  then `useEntry` — shares TripLayout's cached query, no extra request). Same four
  tabs, order and routes as before: Ideas → `/trips/:id` (with `end`), Map /
  Schedule / Checklist → `/trips/:id/<key>`.
- **Trip progress removed.** `TrailNav` is gone from `TripLayout`'s top right, along
  with `stepFromTab` and the `.trail`/`.tabs` CSS. The `TrailNav` and `TabBar`
  *components* were deliberately kept — `DesignGallery`, their own tests, and
  `TripSchedule`'s Days switcher still use them.
- **Dropdown fixed, two ways.**
  - *Unstyled native chrome*: new `design/components/core/Select.tsx` +
    `.module.css` + `.test.tsx`, exported from `design/components/index.ts`.
    `appearance: none` plus an overlaid lucide `ChevronDown` (`pointer-events: none`).
    Adopted at all three call sites: `EntryDetail`, `NewIdeaModal`, `TripChecklist`.
  - *Double apricot focus ring*: the cause was **specificity**, not a stray rule.
    `design/global.css` styles every focused `input`/`select`/`textarea` with an
    offset apricot outline, and `input:focus-visible` (0,1,1) outranks
    `Input.module.css`'s `.input { outline: none }` (0,1,0) — so the inner input
    painted a second ring inside the wrapper's apricot border.

### The focus-ring convention — do not regress this

On a **bordered** control the ring is:

```css
outline: var(--focus-width) solid var(--focus-ring-wash);
outline-offset: 0;
border-color: var(--focus-ring);
```

i.e. the border goes solid apricot and the outline is the pale wash hugging it at
offset 0. An offset *solid* `--focus-ring` outline on top of an apricot border is
the bug — it renders as two concentric apricot rings with paper between them.
Any override must reach (0,2,0) to beat `global.css`'s (0,1,1).

## All five backlog bullets are now done

The budget held out. Everything below is committed and verified together:
`npm run typecheck` clean, `npm run lint` at the 3-warning baseline,
`npm test` **294 passing across 46 files**.

- `5b48d02` — idea listing rebuilt as rows (`IdeaRow` replaces `IdeaCard`),
  `IdeaList` owns grouping and collapse, `groupByLocation` added alongside the
  retained `groupByCategory`, rating dropped from the row only.
- `b392516` — `BundlePanel` (the 376px rail), `NewBundleBox` (drop-to-create
  plus typed-name placeholder), `useCreateBundle.ts`, `BundleCard` restyled with
  every behaviour intact, `BundleFormModal` reduced to rename-only.
- `5ffa71b` — `TripBoard.tsx` wired to both, M:M entry tree removed.

### What the wiring actually did

1. **Dropped the M:M hierarchy** — the `<details>` "Trip structure" disclosure,
   the `EntryTree` import and the whole `scope` state/`showAll` escape are gone;
   the ideas query always uses `trip.id`. `EntryTree.tsx` is left on disk on
   purpose: this is "not for now", not "never".
2. **Two columns, not three** — `grid-template-columns: minmax(0, 1fr) 376px`
   with `gap: 0`. The zero gap is deliberate: `BundlePanel` draws the rail's own
   hairline, card ground and inner padding, so a grid gap would leave a strip of
   paper before the hairline and read as a floating box rather than a rail. The
   breathing room is `padding-right` on the ideas column instead.
3. **`handleDragEnd` now serves two drop targets**, told apart by droppable data
   rather than id parsing: an existing bundle (copies the link, never removes the
   old one) and the new-bundle box (`{ newBundle: true }` →
   `useCreateBundleWithIdea`, which owns the create-then-link sequencing because
   the link needs the id the POST returns).

### Only if someone picks this up later

- Shift-selecting a range that spans a *collapsed* group still includes the
  hidden entries, because `orderedVisibleIds` is built from `groupEntries` before
  collapse is applied. Genuine edge case, left alone deliberately.
- `IdeaList` renders nothing when filters narrow to zero; `FilterBar`'s
  "Showing 0 of N · widen again" is the escape hatch.

### Known, deliberate deviation from the design

In the mockup the 376px rail runs full height beside the trip title. Here the
title lives in `TripLayout` and the board is its outlet, so the rail starts
*below* the title. Chosen over restructuring `TripLayout`, which is already green.
It still reads correctly (border-left + card ground). Revisit only if asked.

## Verification

From `frontend/`:

```
npm run typecheck && npm run lint && npm test
```

Baselines — do not chase these, they pre-date this work:

- `npm run lint`: exactly 3 `only-export-components` warnings, in `Toast.tsx`,
  `TrailNav.tsx`, `AuthContext.tsx`.
- `bin/rubocop` (backend) is not clean and never has been (~78
  `Layout/SpaceInsideArrayLiteralBrackets`). Irrelevant here — this is all frontend.
- A fresh worktree needs `npm install` in `frontend/` before anything runs.

For a real browser check: `VITE_USE_MOCKS=true npm run dev`, sign in as
`demo@wend.app` / `password`. Note `mcp__claude-in-chrome__form_input` does not
work on this app's controlled React inputs — use the `computer` tool's `type`
action instead.

## House style

Substantial doc comments explaining *why*; CSS modules; design tokens only, never
a hardcoded colour; hover/press are **opacity only**; **no shadows anywhere**;
every drag interaction keeps a keyboard/pointer-free equivalent (that is why the
idea row keeps its checkbox and `AddToBundleMenu`, and why `NewBundleBox` has a
typed-name path alongside the drop target).
