# design-sync notes — wend

Target project: **Wend Design System - v2.4** (`ef4483e7-b6aa-4016-86cf-877e648be2ff`).
First sync: 24 Aug 2026. Shape: `package` (no Storybook).

## Re-sync command

```sh
# .ds-sync/ is gitignored — re-stage it on a fresh clone (see the skill's step 7 cp line),
# then: npm i esbuild ts-morph @types/react playwright && npx playwright install chromium
# The css.mjs fork imports from ../../.ds-sync/lib/, so .ds-sync/ must exist. No symlink needed.
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules frontend/node_modules \
  --entry ./frontend/src/design/components/index.ts \
  --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```

## Repo-specific gotchas

- **This is an app repo, not a library.** The DS lives at `frontend/src/design`; `frontend/`
  itself is a private Vite app with no `main`/`module`/`exports` and no library build. There is
  no `buildCmd` — nothing to run before the converter.
- **`--entry` is mandatory.** Without it the converter resolves `PKG_DIR` as
  `frontend/node_modules/frontend`, which doesn't exist, and dies in `projectFor` with ENOENT.
  With `--entry` it walks up to `frontend/package.json` correctly.
- **`--entry` disables auto-discovery**, so all 8 components are pinned explicitly in
  `cfg.componentSrcMap`. `exportedNames()` reads a shipped `.d.ts` tree that doesn't exist here,
  so without the map you get `[ZERO_MATCH]`. **Adding a component to `src/design` means adding it
  to `componentSrcMap` too** — it will NOT be picked up automatically. `Tag` maps to `Chip.tsx`
  (both live in that file).
- **`.design-sync/overrides/css.mjs` is a forked `lib/css.mjs`.** Upstream `copyTokens()` returns
  early unless `tokensPkg` resolves under `node_modules`, and Wend's tokens are plain source files.
  The fork makes the `package.json` read optional so `tokensPkg: "../src/design"` works. Without it,
  `styles.css` ships with a single `@import` and **every component renders unstyled** — this was
  silent, not an error. On re-sync, diff the fork against the bundled `lib/css.mjs`.
- **`global.css` rides in via `cfg.cssEntry`**, appended into `_ds_bundle.css`. It carries the body
  type, the box-sizing reset and the global `:focus-visible` apricot ring. It is *not* covered by
  `tokensGlob` (that only matches `tokens/*.css`), so it needs its own config slot.
- **`.d.ts` props are hand-written in `cfg.dtsPropsFor`** — all 8 of them. With no built type tree
  the extractor emits `{ [key: string]: unknown }` stubs, which validate happily and tell the design
  agent nothing. **If a component's props change in source, `dtsPropsFor` must be updated by hand.**
  This is the single most likely thing to silently rot.
- **Guidelines and assets are copied in AFTER the build**, because `package-build.mjs` wipes `--out`:
  ```sh
  mkdir -p ds-bundle/guidelines ds-bundle/assets
  cp wend-design-v2.3/guidelines/*.html ds-bundle/guidelines/
  cp frontend/public/brand/*.svg        ds-bundle/assets/
  ```
  Guidelines come from the hand-authored v2.3 export; assets come from `frontend/public/brand/`
  (the live source of truth — verified byte-identical to the v2.3 copies since the plum fix below).
  The cards carry their own `@dsCard` headers, and reference
  `../styles.css` + `../assets/*.svg`, which resolve at the bundle root. `assets/**` is therefore in
  the upload plan's writes/deletes on top of the skill's standard list.
- **Don't run `npm ci` in `frontend/`** unless you mean to — it wipes `node_modules` out from under
  the user's dev server on 5173. It was already complete on the first sync and was skipped.

## Known render warns

- `[FONT_REMOTE] "Atkinson Hyperlegible", "DM Mono"` — expected and correct. `tokens/fonts.css` is a
  single Google Fonts `@import`; the families load at runtime and nothing needs to ship in `fonts/`.
  This is **not** `[FONT_MISSING]` and needs no action.

## Findings surfaced by the first sync — both FIXED, 24 Aug 2026

- **Stale brand plum.** `frontend/public/brand/michikusa-mark{,-small,-reversed}.svg` *and*
  `frontend/public/favicon.svg` still filled the destination stop with the retired red-family plum
  (`#8A4A61`, `#E4B5C4`) instead of murasaki `#754E75` / `#B497B4` — four files that missed the v2.3
  palette change, with nothing in the repo to catch it. Fixed; `Logo.tsx`'s docstring now records why
  these static files need re-checking whenever a stop colour moves.
  **Watch:** the only remaining `#8A4A61` in the repo is the historical note in `tokens/colors.css`,
  which is correct and should stay.
- **`Switch` had no disabled styling.** `Switch.module.css` had no `:disabled` rule, so a disabled
  switch was pixel-identical to an enabled one. An authored `Disabled` preview cell was written and
  dropped for exactly that reason before the fix landed. Now the track drops to `--surface-disabled`
  in both states and the label goes muted, so knob position still carries on/off — and the `Disabled`
  cell is back, graded good. Hover/active are gated behind `:not(:disabled)` to match Button.

## Re-sync risks — what can silently go stale

1. **`cfg.dtsPropsFor` is a hand-maintained copy of the source interfaces.** Nothing cross-checks it.
   A prop added, renamed or retyped in `src/design` will not appear, and the design agent codes
   against the stale contract. **Re-read the 8 source interfaces on every re-sync.** The real fix is
   giving the DS a real library build with emitted `.d.ts`, which would delete this whole field.
2. **`cfg.componentSrcMap` is a hand-maintained component list** (see above) — a new component is
   invisible until it is added.
3. **The `css.mjs` fork is pinned to upstream's current shape.** If the skill's `lib/css.mjs` changes,
   the fork silently keeps the old behaviour. Diff it on re-sync.
4. **Guidelines are a snapshot of `wend-design-v2.3/`, not of live code.** Their `var(--*)` references
   were all verified against the current tokens on 24 Aug 2026, but a token renamed or deleted in
   `src/design/tokens` will break a guideline card with no warning. Re-run:
   `grep -ho 'var(--[a-z0-9-]*' wend-design-v2.3/guidelines/*.html | sed 's/var(//' | sort -u`
   against the token definitions. Note `--wend-hatch-a` was already deleted from the repo tokens and
   no guideline used it — that check earned its keep once already.
5. **Fonts are network-dependent.** Nothing is vendored; if the Google Fonts `@import` is ever blocked
   or removed, every design silently falls back to system fonts.
6. **Previews import from the bare package name `'frontend'`** (`cfg.pkg`). Renaming the package in
   `frontend/package.json` breaks all 8 authored previews at once.
7. **Static brand files drift from the tokens.** The four SVGs under `frontend/public/brand/` and
   `frontend/public/favicon.svg` carry literal hex that no token change propagates to. They drifted
   once already (see above). Re-check them whenever a stop colour moves.
