# Wend Design System

Wend is a travel planning app. Planning happens at a desk — comparing ideas, drafting versions of a trip, moving things between days — so the planning surfaces are designed for desktop first, with room to hold several options side by side. Travelling happens on a phone, so the finished plan is designed for mobile first: large type, high contrast, readable in bright sun while walking.

The brand's one figure is the **Michikusa mark**, a dotted trail. Everything else stays quiet, legible and out of the way. One typeface, one accent, generous space.

> 道草 *michikusa* — "grass by the road", the Japanese word for dawdling on the way.

## Sources

Developed in this project from a written brief: adult elegance with energy and play, Japanese design principles, palette referencing Sanzo Wada's *A Dictionary of Color Combinations*. No external codebase, Figma file or existing brand was supplied. The written spec lives in `Wend Design System.dc.html`.

## Principles

1. **Nothing is discarded.** Narrowing hides options, never deletes them. Every view has a way back to the wider one, and anything set aside can be picked up again.
2. **Grouping is the mechanic.** Ideas are gathered, split, regrouped and compared constantly. Anything that can be grouped can be ungrouped just as cheaply, any group can be duplicated or forked, and two versions of the same thing can sit side by side until someone decides.
3. **Legible before lovely.** Times, platforms and addresses are read in bright sun, in a hurry. They set the type floor.

## Content fundamentals

Playful, forgiving, fond of detours. Second person, short sentences, plain words. Sentence case everywhere except labels (uppercase, tracked) and the wordmark (uppercase, 0.26em). No emoji. No exclamation marks. Never urgent or scarce — no countdowns, no "only 2 left", no "optimise".

Buttons are verbs of movement rather than nouns: "Keep both for now", "Take the long way". Placeholders ask a plain question rather than naming a field: "Where are you going?" not "Destination".

- Yes: "You'll get there. Slowly is fine."
- Yes: "Kept — it's waiting in your shortlist."
- Yes: "Kept nine places so far"
- No: "Optimise your itinerary now."
- No: "You haven't finished your trip!"

Numbers are written plainly: 24-hour times (`09:40`), en-dash ranges (`10:15–11:40`), middot separators for metadata (`morning · east`).

## Visual foundations

**Colour.** Two greens carry the product: deep leaf `#2F4A36` for text and dark surfaces, leaf green `#3F6B4A` for actions and the trail. Apricot `#E89A5E` is the only warm colour and it means one thing — *this is where you are now*. It is a shape, never a text colour: a ring, a focus outline, an underline. Plum `#8A4A61` marks destinations and saved things. Backgrounds are paper `#F0F3EE` with cards a half-step lighter at `#FBFCFA`. All text tokens clear WCAG AA against paper; ratios are recorded on the colour cards.

**Type.** Atkinson Hyperlegible, Regular and Bold, everywhere — chosen for the slashed zero, tailed *l* and serifed *I*, because an itinerary is mostly numbers. Display 40/1.2, title 26/1.3, body 17/1.7, minimum 15px, measure 60–70 characters. DM Mono appears only for codes, coordinates and counters. No italics for emphasis in UI; use bold.

**Wordmark.** Bold caps at 0.26em tracking, fixed at every size — the tracking is the signature and makes the letters read as separate steps. Lock-up: mark left, wordmark right, gap equal to the cap height.

**Layout & space.** 4px base: 8 · 12 · 16 · 24 · 32 · 48 · 64. Screen gutter 20px, list rows 12px apart, sections 48px — the gap is the divider, not a rule. Every tap target is at least 48×48 on touch, including the small circular keep toggles; pointer targets may be smaller but never below 32×32.

**Shape.** Cards 6px, media 14px, buttons and chips full pills, stops and toggles circles, phone surfaces 22px. Borders 1.5px (2px when a border carries an action). **No shadows anywhere** — elevation is page tone versus card tone.

**Backgrounds & imagery.** Flat paper. No gradients, no textures, no full-bleed photography in the system itself. Where imagery goes, use the diagonal hatch placeholder (`--placeholder-hatch`) until real photographs are supplied — never a grey box. The one dark surface in the product is the finished day plan, which inverts for outdoor reading.

**Animation.** One gesture: the trail draws itself forward when a step completes, dot by dot, 420ms ease-out. Going back plays it in reverse at the same speed — returning should feel as considered as advancing. Everything else is a 160ms opacity change. No bounces, no scale, no spring. `prefers-reduced-motion` collapses both durations to zero; the dots still change state.

**States.** Hover and press are opacity only — the palette does not lighten or darken. Focus is always a 3px apricot ring offset 3px, the same colour that means "you are here". Disabled fills with `--surface-disabled` and muted text; nothing is ever struck through or greyed out to indicate rejection, because nothing is rejected.

**Transparency & blur.** Not used. The only translucent value in the system is `--focus-ring-wash` behind a focused input.

## Iconography

The system ships **no icon set**. Wend's only mark-level graphic is the Michikusa trail and its stop circles, which carry all state meaning (decided, open, waiting, destination) without labels or glyphs. Metadata is written as words, not symbolised.

Where a product screen needs true utility icons (back, close, share, map pin), use **Lucide** from CDN at 1.5px stroke to match the border weight, in `--text-strong` or `--text-muted`. This is a substitution, not a brand asset — flagged below. Unicode is used sparingly for one affordance only: `↵` as the return hint in inputs. No emoji, ever.

Assets in `assets/`: `michikusa-mark.svg` (primary), `-reversed.svg` (on deep leaf), `-mono.svg` (single colour, `currentColor`, for favicons and stamps), `-small.svg` (thicker stroke for use at 24–28px).

## Index

- `styles.css` — the entry point. Link this one file.
- `tokens/` — `fonts`, `colors`, `typography`, `spacing`, `shape`, `motion`.
- `assets/` — the four Michikusa mark variants.
- `components/brand/` — `Logo`, `Trail`
- `components/core/` — `Button`, `Chip`, `Input`
- `guidelines/` — 13 specimen cards across Colors, Type, Spacing, Brand
- `Wend Design System.dc.html` — the written spec, read as a document

### Intentional additions

- `Input` — no source defined form fields; added because planning begins with a written question. Its leading and trailing slots take any node, so icons are supported without the system owning an icon set.

### Scope

This system carries brand identity and primitives only. Application screens, flows and product-specific components were removed deliberately so the app UX can be redesigned from scratch — do not infer product structure from this repository.

## Caveats

- **Fonts load from Google Fonts CDN.** No binaries are vendored, so `@font-face` rules are absent — `tokens/fonts.css` imports the hosted families instead. If you need offline or self-hosted use, supply the Atkinson Hyperlegible and DM Mono files and I will vendor them.
- **No icon set.** See Iconography above; Lucide is a proposed substitution, not a chosen one.
- **No photography.** All imagery is the hatch placeholder.
- **Contrast ratios are calculated, not measured on device.** Verify against real screens before shipping.
