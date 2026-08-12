# TASK_STATUS_011 — Idea list filter + grouping control

**Status:** DONE — implementation in `130dfdb`, follow-up styling fix on top (see the last log entry). Pushed to `origin`. Nothing outstanding except the one flagged follow-up (`+ New bundle` is still `size="small"`, see the end of the log).
**Branch:** `worktree-feat-011-idea-list-controls`
**Worktree:** `.claude/worktrees/feat-011-idea-list-controls`
**Last updated:** 2026-08-12 — implementation subagent, after verification

If you are picking this up cold: read "The ask" and "Decisions already made"
(they are settled — do not re-ask them), then "Progress log" for where things
stopped.

---

## The ask

[feat-011] Rework the trip board's idea-list controls to match the Claude Design
project `Wend MVP.dc.html`
(https://claude.ai/design/p/e4d5ea4d-7a91-46e1-b2f2-d8a6d7012f6e):

1. Filter + grouping control like the design.
2. "+ New idea" becomes the primary button; "+ New bundle" becomes secondary.
3. Use the **codebase's** button radius, not the design's 999px pill.

## The design, as read from `Wend MVP.dc.html`

The board's control row (design lines ~184–226) is a single row:

```
[ Filter (2) ]  │  [ Ungrouped | By location | By category ]        [ + New idea ]
Showing 8 of 21 · See all
```

- **Filter button** — outlined button, label "Filter", plus a count badge
  (`--wend-leaf-soft` bg, `--wend-leaf` text, mono font) shown only when
  filters are active. Its border goes `--wend-leaf` when narrowed, else
  `--border-strong`.
- **Divider** — 1.5px × 22px `--border-subtle` between filter and grouping.
- **Grouping** — segmented control, track `--wend-line`, selected pill
  `--surface-card` + `--text-strong` + bold; unselected `--text-muted`,
  transparent. Three options: Ungrouped / By location / By category — exactly
  the three already in `GROUP_MODES` in `features/board/filters.ts`.
- **"+ New idea"** — primary Button, right-aligned on the same row (design
  `hint-size="auto,40px"`, i.e. our `size="small"`).
- **Filter popover** — opens below-left of the Filter button, 360px wide,
  `--surface-card`, 1.5px `--border-subtle`, padding 18px, gap 16px. Two
  labelled sections, "WHAT" (category chips) and "STATE" (state chips), both
  using the existing `Chip` component. A full-screen invisible click-catcher
  sits behind it to close on outside click.
- **Count line** — sits *below* the control row, `--text-muted`.
- **"+ New bundle"** — design line ~513, `variant="secondary"`,
  `hint-size="auto,36px"`, full width in the bundle rail.

## Decisions already made (confirmed with the user — do not re-litigate)

1. **Full popover, per design.** The What/State chips move out of the always-on
   bar and into the dropdown. Existing `FilterBar.test.tsx` expectations will
   need updating to open the popover first.
2. **Board only.** `features/board/FilterBar.tsx` and the bundle-panel button.
   `LibraryFilterBar` and `MapFilterBar` are explicitly OUT of scope.
3. **Radius = `--radius-card` (12px).** The design's `border-radius:99px` on the
   Filter button, the segmented track and the segmented pills is deliberately
   NOT copied. `Chip` keeps whatever radius it already has. The count badge may
   stay pill-shaped (it is a badge, not a button) — use judgement.

## Codebase facts worth knowing

- Button radius token: `--radius-card: 12px` in
  `frontend/src/design/tokens/shape.css`. `Button.module.css` uses it for
  `primary` / `secondary` / `onDark`.
- `GROUP_MODES`, `IdeaFilters`, `EMPTY_FILTERS`, `isNarrowed` all already exist
  in `frontend/src/features/board/filters.ts` — **no model changes are needed**,
  this is a presentation change.
- The grouping control today is `components/TabBar.tsx` (role=tablist, roving
  tabindex, arrow keys). It is also used for trip sub-navigation, so do not
  restyle TabBar globally — either add an opt-in size/variant or build the
  board's segmented control locally, keeping the arrow-key behaviour.
- `BundlePanel.tsx:96` renders `+ New bundle` as `variant="primary"` while its
  own doc comment at line 40 already says it should be secondary. Fix the code
  to match the comment.
- Verify with `scripts/test frontend` and `scripts/lint`. There are pre-existing
  rubocop/oxlint baseline warnings unrelated to this work — compare against the
  baseline rather than expecting zero.

## Files in play

- `frontend/src/features/board/FilterBar.tsx` + `.module.css` (main rework)
- `frontend/src/features/board/FilterBar.test.tsx` (update)
- `frontend/src/features/board/BundlePanel.tsx` (primary → secondary)
- `frontend/src/features/board/BundlePanel.test.tsx` (if it asserts variant)
- possibly `frontend/src/components/TabBar.tsx` (+ css) for a compact variant
- `frontend/src/routes/TripBoard.tsx` (only if props change)

---

## Progress log

- **2026-08-12** — Orchestrator: read the design file, read the current
  FilterBar/filters/TabBar/Button/BundlePanel, confirmed the three decisions
  above with the user, created worktree + this file. Next: spawn the
  implementation subagent.

- **2026-08-12** — Implementation subagent. Everything below is DONE; nothing
  is half-done.

  **Files changed** (7, all frontend):

  1. `frontend/src/features/board/FilterBar.tsx` — rewritten.
     - Row 1 is one `space-between` flex row: `[Filter button] │ [segmented
       control]` on the left, `+ New idea` (`variant="primary" size="small"`)
       on the right. Row 2 is the bare `Showing N of M · See all` paragraph.
     - The What/State chips moved into a popover behind the Filter button.
       Chips are still the `Chip` component with `aria-pressed`; the popover is
       `role="group" aria-label="Filter ideas"`.
     - Popover behaviour follows `IdeaActionsMenu`'s existing pattern rather
       than the design's full-screen click-catcher: a `document` `mousedown`
       listener for outside clicks plus a `keydown` listener for Escape.
       Rationale (also in the code): a catcher element swallows the first click
       anywhere on the page. Opening focuses the first chip; Escape closes and
       returns focus to the trigger.
     - Trigger has `aria-haspopup="true"`, `aria-expanded`, and
       `aria-label={"Filter (N active)"}` when narrowed — so the count is never
       badge/colour-only. The visible badge is `aria-hidden` to avoid a double
       announcement. Clicking a chip does NOT close the panel.
     - `See all` and the count line stay OUTSIDE the popover: the way out of a
       narrowing must not be behind the control that caused it.
     - **Props unchanged.** `FilterBarProps` is identical, so `TripBoard.tsx`
       needed no edit (only the `onNewIdea` doc comment's wording changed).
     - `filters.ts` was NOT touched. The badge count is a local
       `activeFilterCount()` helper in FilterBar.tsx — deliberately not next to
       `isNarrowed`, because the model's question is binary and "how many chips
       are lit" is a fact about this bar. Documented in the code.

  2. `frontend/src/features/board/FilterBar.module.css` — rewritten around the
     new structure. `.filterButton` (36px, `--radius-card`, `--border-strong`,
     `--action-primary` border when narrowed), `.count` badge, `.divider`,
     `.popover`, `.leftGroup`, `.filterWrap`; `.summary`/`.widen` unchanged;
     `.countRow` and the old `.chips` flex-basis block deleted with it.

  3. `frontend/src/components/TabBar.tsx` — added an **opt-in**
     `variant?: 'nav' | 'compact'` prop, default `'nav'`. Nav behaviour and
     appearance are byte-for-byte unchanged, so trip sub-navigation is
     untouched. Chose this over a locally-built segmented control so the
     roving-tabindex/arrow-key contract exists in exactly one place.

  4. `frontend/src/components/TabBar.module.css` — all new rules scoped under
     `.compact`: solid `--wend-line` track, no border, `--radius-card`,
     36px pills, selected = `--surface-card` + `--text-strong` + bold.

  5. `frontend/src/features/board/BundlePanel.tsx` — `+ New bundle`
     `variant="primary"` → `variant="secondary"`, matching its own doc comment.

  6. `frontend/src/features/board/FilterBar.test.tsx` — 34 tests. All prior
     behavioural coverage kept (filtering narrows, unsetting, orthogonality
     with grouping, See all clears/hides, new-idea button), with chip
     assertions now opening the popover first via an `openFilters()` helper.
     Added: popover hidden until asked for, `aria-expanded`/`aria-haspopup`,
     close by re-click, close by outside click, Escape closes + restores focus,
     first chip focused on open, stays open while toggling chips, and four
     active-count tests (0/2/3 active in the accessible name, badge text).

  7. `frontend/src/components/TabBar.test.tsx` — one added test: the `compact`
     variant keeps tablist/tab roles, `aria-selected`, roving tabindex and
     End-key selection.

  **Departures from the transcribed design, both deliberate and commented:**
  - Radius `--radius-card` everywhere instead of 99px — as decided above.
  - The count badge is `--action-primary` on `--action-primary-text`, not the
    design's `--wend-leaf` on `--wend-leaf-soft`. That pairing measures ~2.5:1,
    well under 4.5:1 for a 13px numeral. The inverted action pair is ~5.5:1 and
    keeps the same green family plus the app's own "this is on" language.
  - Outside-click uses a document listener, not a click-catcher element (above).

  **Verification** (from the worktree root):
  - `scripts/test frontend` → **47 files, 352 tests, all passed.**
  - `scripts/lint` → sorbet clean; **tsc clean**; oxlint = the 3 known
    pre-existing `only-export-components` warnings (`Toast.tsx`,
    `TrailNav.tsx`, `AuthContext.tsx`) and no others; rubocop = 126 offenses,
    all `Layout/SpaceInsideArrayLiteralBrackets`, all in `backend/`, which this
    change does not touch at all (`git status` is frontend-only), so the
    `error failing: rubocop` line is entirely the standing baseline.

  **Deliberately left alone:**
  - `LibraryFilterBar` / `MapFilterBar` — out of scope.
  - `BundlePanel.tsx`'s `size="small"` on `+ New bundle`. Its doc comment
    claims the button is `medium`; the code has said `small` since commit
    9d1f549. That drift is pre-existing and orthogonal to the variant fix, but
    it matters: the comment's own argument is that this is the ONLY route to a
    new bundle and `small` sits under `--tap-min`. Either the size should go
    back to `medium` or the comment should be corrected — flagged for the
    orchestrator rather than changed unasked, since it moves rail layout.
  - No `@media (pointer: coarse)` bump on the 36px controls: the row's primary
    Button is `size="small"` (also 36px) and bumping only two of the three
    would break the row's optical line.

- **2026-08-12** — User feedback, applied. Two changes, CSS only, no TS touched:

  1. **Grouping control is a pill again.** Decision 3 above ("radius =
     --radius-card") is now scoped to the *buttons* only. `.compact` and
     `.compact .tab` in `TabBar.module.css` dropped their `border-radius`
     overrides and fall back to the base `--radius-pill`, per the design. The
     Filter button and `+ New idea` keep `--radius-card`. The rationale, written
     into the CSS: a segmented control is a set of choices, not a button, and the
     capsule is what says so — three 12px rectangles inside a 12px rectangle read
     as three adjacent buttons.

  2. **Row heights now actually line up.** The old compact track was
     4px padding + 36px tab + 4px = 44px against a ~39.5px row, which is what the
     user saw. Two fixes:
     - `.compact { padding: 3px }` and `.compact .tab { min-height: 30px;
       padding: var(--space-1) var(--space-3) }`. Deliberately *both* a floor and
       real padding, so the track matches `Button.small` under either line-height
       regime: 3 + (4 + 25.5 + 4) + 3 = 39.5px when the inherited 1.7 governs
       (= `small`'s 25.5 + 14px padding), and 6 + 30 = 36px when a UA collapses
       the button line box (= `small`'s min-height).
     - `.filterButton` border `--border-width` → `--border-width-strong`.
       Button's size block cuts `small`'s 5px padding on the assumption the
       bordered variants absorb a 2px edge (see the comment above `.button.small`
       in `Button.module.css`); pairing that padding with a 1.5px hairline left
       this button 1px shorter than both its neighbours. The quiet look comes
       from `--border-strong` being a neutral, not from a thinner line.

  Re-verified: `scripts/test frontend` → 47 files, 352 tests, all pass (CSS-only,
  so no test churn); `tsc` clean; oxlint = the same 3 pre-existing
  `only-export-components` warnings and nothing new.

  **Not measured in a browser** — the heights above are derived from the token
  values and Button's own size block, not observed. If the row still looks off,
  that is the first thing to check.
