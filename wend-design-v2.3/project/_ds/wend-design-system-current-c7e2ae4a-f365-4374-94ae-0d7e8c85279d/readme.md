# Wend Design System

Wend is a travel planning app. Planning happens at a desk — comparing ideas, drafting versions of a trip, moving things between days — so the planning surfaces are designed for desktop first, with room to hold several options side by side. Travelling happens on a phone, so the finished plan is designed for mobile first: large type, high contrast, readable in bright sun while walking.

The brand's one figure is the **Michikusa mark**, a dotted trail. Everything else stays quiet, legible and out of the way. One typeface, one accent, generous space.

> 道草 *michikusa* — "grass by the road", the Japanese word for dawdling on the way.

## Sources

- A written brief — adult elegance with energy and play, Japanese design principles, palette referencing Sanzo Wada's *A Dictionary of Color Combinations*. No Figma file, repository or shipped product was supplied.

## Principles

1. **Nothing is discarded by accident.** Narrowing is the default and it hides rather than deletes: every view has a way back to the wider one, and anything set aside can be picked up again. But deletion is a real user need, not a failure state — when someone asks to delete, delete it. Say plainly what went and offer one way back.

   - **Set aside** (default, no confirmation): filtering, narrowing, "not this trip". Reversible from the wider view. Copy names where it went — "Set aside. It's still in your shortlist."
   - **Delete** (explicit): one confirmation naming the thing and the consequence, then an undo that lasts the session. "Delete "Fushimi Inari"? It will be removed from day 3 and your shortlist."
   - **Guarded delete**: whole trips and shared plans ask for a typed confirmation and say that it cannot be undone. Nothing else does.
   - Never delete silently, and never hide something while implying it is gone.
2. **Grouping is the mechanic.** Ideas are gathered, split, regrouped and compared constantly. Anything that can be grouped can be ungrouped just as cheaply, any group can be duplicated or forked, and two versions of the same thing can sit side by side until someone decides.
3. **Legible before lovely.** Times, platforms and addresses are read in bright sun, in a hurry. They set the type floor.

## Content fundamentals

Playful, forgiving, fond of detours. Second person, short sentences, plain words. Sentence case everywhere except labels (uppercase, tracked) and the wordmark (uppercase, 0.26em). No emoji. No exclamation marks. Never urgent or scarce — no countdowns, no "only 2 left", no "optimise".

**Plain mechanics, playful margins.** Anything the user must act on is literal; personality lives beside it. Copy sitting *on* a control names the outcome. Copy sitting *beside* one can wander.

- **Buttons** name the outcome in ordinary words: "Save trip", "Add scenic route", "Save both", "Delete". Movement verbs like "Take the long way" or "Keep both for now" are headings and confirmations, not labels — a user should never have to press a button to find out what it does. Soften in helper text instead: "Add scenic route" · *Adds about 40 minutes.*
- **Field labels** use the common, expected term: Destination, Arrival date, Travellers. Never a riddle, never a brand word.
- **Placeholders** may ask a plain question — "Where are you going?" — but a placeholder is never the only label: it disappears the moment someone types.
- **Errors** name the fix, not the fault: "Enter a date in 2026 or later.", not "That date won't do." Still no exclamation marks, still not urgent.
- **Confirmations and empty states** are where the voice lives: "Saved. Six days, nothing locked in.", "Kept — both are in your shortlist."

- Yes: "You'll get there. Slowly is fine."
- Yes: "Kept — it's waiting in your shortlist."
- Yes: "Kept nine places so far"
- No: "Optimise your itinerary now."
- No: "You haven't finished your trip!"
- No: "Take the long way" *(on a button)*
- No: an unlabelled field whose only label is its placeholder

Numbers are written plainly: 24-hour times (`09:40`), en-dash ranges (`10:15–11:40`), middot separators for metadata (`morning · east`).

## Visual foundations

**Colour.** Two greens carry the product: deep leaf `#2F4A36` for text and dark surfaces, leaf green `#3F6B4A` for actions and the trail. Apricot `#E89A5E` means one thing — *this is where you are now* — and it is a shape, never a text colour: a ring, a focus outline, an underline. Bister `#55402F` marks destinations and saved things. Backgrounds are paper `#F0F3EE` with cards a half-step lighter at `#FBFCFA`.

The red family is deliberately absent from the brand so that it can mean exactly one thing. Feedback sits outside the brand palette: jade `#0F7A5A` for success — cooler and brighter than action leaf, so a confirmation never reads as a button — and rust `#A6432B` for errors and the one destructive control. Jade never fills a control; it borders, ticks and writes. Rust fills only `Button variant="destructive"`.

Previous accents straw `#C98A1E` and indigo `#3B4E80` are retired; the aliases have been removed. All work uses `--wend-apricot` and `--wend-bister`. All text tokens clear WCAG AA against paper; ratios are recorded on the colour cards.

**Type.** Atkinson Hyperlegible, Regular and Bold, everywhere — chosen for the slashed zero, tailed *l* and serifed *I*, because an itinerary is mostly numbers. Display 40/1.2, title 26/1.3, body 17/1.7, minimum 15px, measure 60–70 characters. DM Mono appears only for codes, coordinates and counters. No italics for emphasis in UI; use bold.

**Wordmark.** Bold caps at 0.26em tracking, fixed at every size — the tracking is the signature and makes the letters read as separate steps. Lock-up: mark left, wordmark right, gap equal to the cap height.

**Layout & space.** 4px base: 8 · 12 · 16 · 24 · 32 · 48 · 64. Screen gutter 20px, list rows 12px apart, sections 48px — the gap is the divider, not a rule. Every tap target is at least 48×48 on touch, including the small circular keep toggles; pointer targets may be smaller but never below 32×32.

**Shape.** Cards 6px, media 14px, buttons and chips full pills, stops and toggles circles, phone surfaces 22px. Borders 1.5px (2px when a border carries an action). **No shadows anywhere** — elevation is page tone versus card tone.

**Backgrounds & imagery.** Flat paper. No gradients, no textures, no full-bleed photography in the system itself. The one dark surface in the product is the finished day plan, which inverts for outdoor reading.

**Animation.** One gesture: the trail draws itself forward when a step completes, dot by dot, 420ms ease-out. Going back plays it in reverse at the same speed — returning should feel as considered as advancing. Everything else is a 160ms opacity change. No bounces, no scale, no spring. `prefers-reduced-motion` collapses both durations to zero; the dots still change state.

**States.** Hover and press are opacity only — the palette does not lighten or darken. Focus is always a 3px apricot ring offset 3px, the same colour that means "you are here". Disabled fills with `--surface-disabled` and muted text. Set-aside items are never struck through — they read as normal content in a quieter place. Strikethrough and greying are reserved for items in the process of being deleted.

**Forms & feedback.** Every field carries a label; a question placeholder is decoration on top of it, not a substitute. Validation runs on blur, not per keystroke. Four field states: default, `success` (jade border and tick), `error` (rust border, bold rust message, `role="alert"`), `pending` (monospaced `checking…`, no spinner). After a submit attempt a `FormBanner` summarises above the first field and lists the fields that need a look; field-level messages stay in place alongside it. Washes appear nowhere else in the system.

**Transparency & blur.** Not used. The only translucent value in the system is `--focus-ring-wash` behind a focused input.

## Iconography

The system ships **no icon set**. Wend's only mark-level graphic is the Michikusa trail and its stop circles, which carry all state meaning (decided, open, waiting, destination) without labels or glyphs. Metadata is written as words, not symbolised.

Where a product screen needs true utility icons (back, close, share, map pin), use **Lucide** from CDN at 1.5px stroke to match the border weight, in `--text-strong` or `--text-muted`. This is a substitution, not a brand asset — flagged below.

Assets in `assets/`: `michikusa-mark.svg` (primary), `-reversed.svg` (on deep leaf), `-mono.svg` (single colour, `currentColor`, for favicons and stamps), `-small.svg` (thicker stroke for use at 24–28px).

## Index

- `styles.css` — the entry point. Link this one file.
- `tokens/` — `fonts`, `colors`, `typography`, `spacing`, `shape`, `motion`.
- `assets/` — the four Michikusa mark variants.

### Components

- `components/brand/` — **Logo**, **Trail**
- `components/core/` — **Button**, **Chip**, **Input**, **Card**, **Label**, **KeepToggle**, **FormBanner**
- `components/travel/` — **PlaceCard**, **TimeRow**

Each directory carries a `@dsCard` HTML showing its states, plus a `.d.ts` props contract and a `.prompt.md` per component.

### UI kits

- `ui_kits/roadbook/` — mobile, 390×844. Today (deep leaf, for outdoor reading), the six days, and what you kept.

No desktop planner kit is included. The planning surfaces are still open — see Caveats.

### Guidelines

- `guidelines/` — 22 specimen cards across Colors, Type, Spacing, Brand.

### Intentional additions

The source defined five components. These four were added because the UI kits could not be composed without them, and each follows a rule the source already states:

- `FormBanner` — the form-level summary the feedback rules require; without it every kit hand-rolls an error box.
- `Input` — carried over from the source. Planning begins with a written question; its leading and trailing slots take any node, so icons are supported without the system owning an icon set.
- `Card` — the source states "elevation is page tone versus card tone". That needed a surface component so kits don't hand-roll one and quietly add a shadow.
- `Label` — the uppercase 12/0.12em label is a documented type role with no component; it appears on nearly every screen.
- `KeepToggle` — the source names "the small circular keep toggles" and their 48×48 rule but ships no control.
- `PlaceCard`, `TimeRow` — the two repeated content units of the product (an idea on the board; a line of the day plan). Both are pure compositions of the above.

### Scope

This system carries brand identity and primitives only. Application screens, flows and product-specific components were removed deliberately so the app UX can be redesigned from scratch — do not infer product structure from this repository.

## Caveats

- **The Roadbook screens are new compositions, not recreations.** The source carries brand and primitives only and explicitly says product screens were removed so the app UX could be redesigned. The kit follows the documented rules and the product brief (mobile on the road) but no existing Wend interface was available to copy. Treat it as a proposal.

- **Sample trip content is invented** (a six-day Kyoto trip) and written to the voice rules above.

- **Fonts load from Google Fonts CDN.** No binaries are vendored, so `@font-face` rules are absent — `tokens/fonts.css` imports the hosted families instead. If you need offline or self-hosted use, supply the Atkinson Hyperlegible and DM Mono files and I will vendor them.

- **No icon set.** See Iconography above; Lucide is a proposed substitution, not a chosen one.

- **Contrast ratios are calculated, not measured on device.** Verify against real screens before shipping.

- **The accent change is not yet applied to the Roadbook kit.** `ui_kits/roadbook/` inherits `--wend-apricot` / `--wend-bister` from the tokens automatically, but its README and comments still say straw and indigo. Say the word and I'll rewrite the kit's own text.

- **A red-free error signal was explored and not chosen.** See `explorations/Directions.html` (Set C) — errors carried by amber and ink weight instead of hue. Worth testing if recognition data ever suggests it.
