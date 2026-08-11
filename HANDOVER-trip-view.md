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

## In flight when the budget ran out

Two subagents were still running. **Their edits are already on disk** — check
`git status` before assuming anything is missing. Neither had reported its final
verification, so treat the tree as unverified until the three commands are re-run.

Files they had created/modified (all under `frontend/src/features/board/`):

- *Idea listing agent* — deleted `IdeaCard.tsx`/`.module.css`, created
  `IdeaRow.tsx`/`.module.css` and `IdeaList.tsx`/`.module.css`, modified
  `filters.ts` (+ new `filters.test.ts`) and `FilterBar.tsx`/`.module.css`.
- *Bundle panel agent* — created `BundlePanel.tsx`/`.module.css`,
  `NewBundleBox.tsx`/`.module.css`, `useCreateBundle.ts`. Had not yet reached
  `BundleCard.tsx`, so that file may still be in its original form.

## The one task nobody started: wire `TripBoard.tsx`

`TripBoard.tsx` and `TripBoard.module.css` were deliberately held back from every
agent to avoid concurrent edits to the same file. They are still in their
**original** state and will not compile against the new components. This is the
next job. Read the new components' exported prop interfaces directly — do not
guess them.

What `TripBoard.tsx` needs:

1. **Drop the M:M hierarchy.** Remove the `<details>` "Trip structure" disclosure
   and the `EntryTree` import, and remove the `scope` state plus the `scopeLine`/
   `showAll` markup. The ideas query then always uses `trip.id`. (`EntryTree.tsx`
   itself can stay on disk — descoped "for now", not deleted.)
2. **Two columns, not three.** Main content column, then a 376px `<aside>` rail
   (`border-left: 1.5px solid var(--border-subtle)`, `background: var(--surface-card)`,
   `padding: 26px 24px 60px`, `flex-direction: column`, `gap: 18px`).
   Replace the `grid-template-columns: 240px minmax(0,1fr) 320px` rule.
3. **Swap in the new components** — `IdeaList` for the `groups.map(...)` card grid,
   `BundlePanel` for the whole existing bundles `<section>`.
4. **Extend `handleDragEnd` for drop-to-create-bundle.** It currently reads
   `over.data.current` as `{ bundleId, title }` and calls `addLink`. It must also
   recognise the `NewBundleBox` droppable and create-then-link instead. The
   create-then-link sequencing lives in `useCreateBundle.ts` — call that, don't
   reimplement it. Check the droppable's actual `id`/`data` in `NewBundleBox.tsx`.
   Idea rows still drag with `data: { entryId, title }` — unchanged contract.
5. **Fix the stale doc comment** at the top of `TripBoard.tsx`: it describes three
   columns and says TripLayout "already draws the trip header, dates and TrailNav".
   TrailNav is gone and the tabs moved to the sidebar.

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
