# Handoff — Wend MVP updated to current Wend Design System

Date: 2026-08-19
Files touched: `Wend MVP.dc.html`, `_ds/wend-design-system-current-c7e2ae4a-f365-4374-94ae-0d7e8c85279d/*`

## Why

The Wend Design System was revised: the accent pair changed, a feedback palette was added, radii changed, and the copy rules for buttons were rewritten. The MVP mockup was built against the previous version.

## 1. Design-system copy re-synced

Refreshed from the bound system (`/projects/c7e2ae4a-f365-4374-94ae-0d7e8c85279d/`) into the project's `_ds/` folder: all six token files, `styles.css`, `_ds_bundle.js`, `readme.md`. No local modifications existed in `_ds/`, so this was a straight overwrite.

What changed inside those files (for reference, not edited by us):

- `tokens/colors.css` — `--wend-plum` / `-tint` / `-wash` removed; `--wend-bister: #55402F` + `-tint: #B79E8E` + `-wash: #EFE8E3` added. New feedback family outside the brand palette: `--wend-jade: #0F7A5A` (success) and `--wend-rust: #A6432B` (errors, one destructive control), exposed as `--feedback-success`, `--feedback-error`, `--border-success`, `--border-error`, `--text-success`, `--text-error`, `--action-destructive`. `--stop-destination` now points at bister.
- `tokens/shape.css` — `--radius-card` 6px → **12px**, `--radius-media` 14px → **10px**. Pill, screen, border and focus values unchanged.
- `_ds_bundle.js` — `Button` now renders at `var(--radius-card)` for every variant (previously pill) and gains `variant="destructive"` (rust fill, the only place the error hue fills a control). `Chip` remains a pill. `Input` and `Card` follow `--radius-card`. New `FormBanner` component.
- `readme.md` — button copy rule rewritten: labels name the outcome in ordinary words; movement verbs ("Take the long way") are headings and confirmations only. New delete model: set aside (default, reversible, no confirmation) vs delete (one confirmation naming the thing plus session-long undo) vs guarded delete (typed confirmation, whole trips and shared plans).

## 2. `Wend MVP.dc.html` changes

All edits were mechanical token/radius/label substitutions on inline styles. No layout, spacing, structure or logic changes.

**Accent swap (plum retired):**
- `--wend-plum` → `--wend-bister` (16)
- `--wend-plum-wash` → `--wend-bister-wash` (6)
- `--wend-plum-tint` → `--wend-bister-tint` (2)

Affected surfaces: the "Cons" label and con-row backgrounds on trip cards, category dots/colours on the idea board, and destination/saved marks.

**Radii:**
- `border-radius:6px` → `12px` (59 occurrences — cards, panels, modals, inputs, selects, list rows, inline pro/con rows)
- `border-radius:14px` → `10px` (3 — hatch/media blocks)
- Buttons moved from pill to card radius (12px), 9 controls: "Add to a bundle", "Change dates", "Fork this day", "Add another", "Clear it", "Use what I wrote", "Fill it", the keep-version button, "What's nearby"
- Deliberately still pills: filter/map/select/detail toolbar toggles, the group-by and expand/collapse segmented controls, lodging choice chips, mobile nav tabs, vote and bundle tags, map pin labels, the progress bar, the scrollbar thumb

**Feedback colour:**
- The remove-person control in the People dialog now uses `--feedback-error` for its text and underline — the only destructive control in the mockup. Nothing else uses rust; jade is not used yet (no success states exist in the mockup).

**Copy (new button rule):**
- "Take them off" → "Remove them"
- "Hand the trip to them" → "Make them the owner"

All other labels already named outcomes plainly and were left verbatim.

## 3. Not done — open follow-ups

1. **Delete model.** The DS now specifies set aside vs delete vs guarded delete. The mockup only implements set aside (archive). Removing a person and removing a pro/con delete immediately with no confirmation and no undo. Needs: one confirmation naming the thing and its consequence, plus a session-long undo. Whole-trip deletion (not present at all today) needs the typed guarded confirmation.
2. **`FormBanner`.** The invite-by-email form has no form-level validation summary; the DS requires one above the first field after a failed submit, with field-level messages alongside. Validation should run on blur.
3. **Jade success states.** No confirmation copy exists in the mockup ("Kept — it's waiting in your shortlist." etc.). If confirmations are added, jade borders/ticks/text only — never a filled control.
4. **Input states.** The mockup's inputs are default-state only; the DS defines `success`, `error` and `pending` (monospaced `checking…`, no spinner).
5. **Hand-rolled controls.** Many buttons, inputs, selects and chips in the mockup are hand-styled rather than mounted from the bundle (`WendDesignSystem_c7e2ae.Button` / `Chip` / `Input` / `Card`). They now match the current tokens, but they will drift again on the next system change. Worth migrating the repeated ones.
