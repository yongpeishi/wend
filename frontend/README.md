# Wend frontend

Vite + React 19 + TypeScript (strict), React Router v7, TanStack Query v5. See
`../doc/architecture.md` for the full contract (§1, §4, §5, §6 are this app's).

## Setup

```
npm install
```

## Run

```
npm run dev
```

Vite serves on `:5173` and proxies `/api` to `http://localhost:3000` (the Rails
backend). If the backend isn't running, the app still works: MSW (Mock Service
Worker) intercepts every `/api/*` request in dev mode by default and serves it
from an in-memory fixture store (`src/mocks/`). Set `VITE_USE_MOCKS=false` to
talk to a real backend instead:

```
VITE_USE_MOCKS=false npm run dev
```

The seeded mock user is `demo@wend.app` / `password`.

## Test

```
npm test          # vitest run — one pass, CI-style
npm run test:watch
```

Vitest + React Testing Library. `src/test/setup.ts` starts an MSW node server
so hooks and integration tests (e.g. `SignIn.test.tsx`) exercise the real
fetch → hook → component path against the same fixtures dev mode uses.

## Typecheck & build

```
npm run typecheck   # tsc --noEmit, strict
npm run build        # tsc -b && vite build
```

`vite.config.ts` and `vitest.config.ts` are intentionally two files, not one
merged config: Vitest bundles its own nested copy of `vite`, and passing a
`test` block into `vite.config.ts`'s `defineConfig()` produces a plugin-type
mismatch between the two `vite` instances under `tsc -b`. Keeping them apart
is the workaround for this specific duplicate-package case.

## Layout

```
src/
  design/            The ported design system — treat as the single source of
    tokens/*.css      truth for color/type/space/shape/motion. Copied verbatim
    styles.css         from wend-design/project/tokens.
    global.css        Base element styles (not in the original bundle).
    components/
      core/            Button, Chip, Tag, Input — ported from components/core/*.jsx
      brand/           Logo, Trail — ported from components/brand/*.jsx
  components/         New components the product screens need — not in the
                       design bundle by design (its README says application
                       components were deliberately removed). See "Component
                       inventory" below for what's here and why.
  api/                Typed fetch client, TanStack Query hooks, types matching
                       architecture.md §4 exactly.
  mocks/              MSW handlers + an in-memory store (dev/test only).
  auth/               AuthContext, ProtectedRoute.
  routes/             One file per route in architecture.md §6, plus /design.
```

## How to use the design system

1. **Tokens are the contract.** Every colour, size, radius and duration in
   `src/design/` and `src/components/` comes from a `var(--token-name)` in
   `src/design/tokens/*.css`. Don't hardcode a hex value or a pixel size that
   already has a token — if you need a new one, add it to the token file, not
   inline.
2. **Reach for `src/components/` before writing new CSS.** `Card`, `Stack`,
   `Row` are the layout primitives (4px scale via the `gap`/`padding` props,
   not raw `margin`). `EntryRow`, `VoteControl`, `Field`, `Modal`, `Drawer`,
   `EmptyState`, `Toast`, `Spinner`, `PageHeader`, `TabBar`, `TrailNav` cover
   the recurring product patterns — check `/design` before building a
   one-off.
3. **`/design` is the visual source of truth for the port.** Run `npm run dev`
   and open `/design` any time you're unsure whether a component looks right
   — every component renders there in every state it supports, including
   focus (tab through it), disabled, error, and both light/dark (deep-leaf)
   backgrounds.
4. **Brand rules that are easy to violate by reflex** (architecture.md §5 has
   the full list): no shadows, ever — elevation is `--surface-card` vs
   `--surface-page` tone only. Apricot (`--wend-apricot` / `--stop-open` /
   `--focus-ring`) is never a text colour. Hover/press are opacity changes
   only — never lighten/darken a colour. Nothing is struck through to mean
   "rejected". Imagery is `<HatchPlaceholder>`, never a grey box or an
   `<img>` fallback.
5. **Focus is handled by real `:focus-visible` CSS**, not a `focused` boolean
   prop — the ported components differ from the `wend-design/` prototypes
   here on purpose (see architecture.md §5's brief for why). Tab through
   `/design` to check it rather than passing a prop.

## Component inventory

### Ported design system (`src/design/components/`)

| Component | Props | Notes |
| --- | --- | --- |
| `Button` | `variant?: 'primary'\|'secondary'\|'quiet'\|'onDark'`, plus every native `<button>` prop (`onClick`, `disabled`, `type`, `aria-*`), forwards `ref` | `type` defaults to `"button"` so it never accidentally submits a form. |
| `Chip` | `selected?`, `tone?: 'default'\|'saved'`, native `<button>` props, forwards `ref` | Real `<button>` with `aria-pressed` for the default tone. |
| `Tag` | `tone?`, native `<span>` props, forwards `ref` | Non-interactive sibling of `Chip` for static labels like "Saved · 12" — see "Invented" below. |
| `Input` | `hint?`, `error?`, native `<input>` props, forwards `ref` | A real `<input>`; the prototype was a static styled `<div>`. Focus ring comes from the wrapper's `:focus-within`. |
| `Logo` | `variant?: 'primary'\|'reversed'`, `size?`, `showWordmark?` | Path data identical to `wend-design/project/assets/michikusa-mark*.svg`. |
| `Trail` | `stops?`, `labels?`, `onDark?`, `height?`, `onSelectStop?: (index) => void` | `onSelectStop` makes labels real buttons; a `'waiting'` stop is never clickable even if supplied. |

### New app components (`src/components/`)

| Component | Props | Notes |
| --- | --- | --- |
| `Card` | `padding? (4px-scale token)`, `bordered?`, native `<div>` props | The only elevation primitive — card tone vs page tone. |
| `Stack` / `Row` | `gap?`, `align?`, `justify?`, `wrap?`, native `<div>` props | Column / row flex layout on the spacing scale. |
| `HatchPlaceholder` | `size?` | The diagonal hatch, `aria-hidden`. |
| `EntryRow` | `title`, `metadata?: string[]`, `kept`, `onToggleKeep?`, `onSelect?` | Generalised "Place row" specimen. Two sibling buttons (main row + keep toggle), never nested. Toggle's tap target is 48×48 even though the dot is 28px. |
| `VoteControl` | `value: number\|null`, `onChange`, `onClear?`, `disabled?`, `average?`, `count?` | Five `role="radio"` stops, `-2..2`. Reads without a legend — dot size encodes strength of feeling, fill marks your vote. Never apricot. |
| `Field` | `label`, `description?`, `error?`, plus `Input` props (minus `id`/`error` collision, resolved) | Labelled wrapper around `Input`. |
| `Modal` | `open`, `onClose`, `title`, `children`, `actions?` | Centered dialog. See "Invented" below for the solid (non-translucent) overlay. |
| `Drawer` | `open`, `onClose`, `title`, `children` | Same overlay approach, slides from the right. Used for `/entries/:id`. |
| `EmptyState` | `message`, `action?` | Renders the architecture.md §5 voice copy verbatim — pass it in, don't rephrase. |
| `Toast`, `ToastProvider`, `useToast()` | `message`, `tone?: 'neutral'\|'success'\|'error'`, `onDismiss?` | See "Invented" below for how tone is carried without a red/error colour. |
| `Spinner` | `label?` | Three dots, staggered 160ms opacity fades — no rotation/bounce. |
| `PageHeader` | `title`, `description?`, `onBack?`, `actions?` | |
| `TabBar` | `tabs: {key,label}[]`, `activeKey`, `onChange`, `aria-label` | Segmented control, full roving-tabindex arrow-key support. |
| `TrailNav` | `current: 'brainstorm'\|'gather'\|'schedule'`, `onSelect?`, `onDark?` | Wraps `Trail` as real trip navigation. |

## Where I had to invent something

The design bundle's own README says application components were deliberately
removed so the app UX could be designed fresh — so several decisions below
aren't "in the spec," they're derived from its stated rules plus the closest
specimen in `Wend Design System.dc.html` §06. Flagging them so the next agent
can revisit if a screen needs something different:

- **Chip vs. Tag split.** The prototype's `Chip.jsx` handles both an
  interactive filter toggle and the static "Saved · 12" tag through one
  component with a `tone` prop. I split it into `Chip` (real `<button>`,
  `aria-pressed`) and `Tag` (`<span>`, no interaction) because a static label
  rendered as a clickable, focusable button is a real accessibility bug —
  screen readers and keyboard users would expect it to do something.
- **EntryRow's keep toggle is two sibling buttons, not one.** The spec only
  shows the row visually. Nesting a toggle `<button>` inside a row
  `<button>` is invalid HTML and breaks keyboard/AT interaction, so the row
  and the toggle are siblings inside a `<div>`, matching the same 14px-gap
  layout.
- **VoteControl's "no legend" idiom.** Nothing in the bundle designs a
  desire-rating control. I mirrored `Trail`'s own idiom (varying stop radii
  carry meaning) — dot size grows with distance from neutral (strength of
  feeling), fill marks the current vote, and the accessible name per stop
  (e.g. "Really want this") carries the meaning for screen readers. Colour is
  a single leaf-green fill regardless of sign, since inventing a second
  "negative" hue isn't in the palette.
- **Modal/Drawer overlay is a solid fill, not a translucent scrim.**
  `readme.md` states plainly: "the only translucent value in the system is
  `--focus-ring-wash`." A typical dimmed backdrop would introduce a second
  translucent value, so the overlay is `background: var(--surface-page)` at
  full opacity — separation from the page underneath comes entirely from
  card tone plus a drawn border, not blur or alpha.
- **No error/red colour exists in the token set.** `colors.css` has no red or
  warning hue. `Field`'s error text and the sign-in error banner render in
  bold `--text-strong`, not colour-coded. `Toast`'s tone is carried by a left
  accent bar only (`success` → `--stop-decided`/leaf, `error` →
  `--stop-destination`/plum, reusing existing brand meanings rather than
  adding a new colour) — the message text itself is always `--text-strong`.
- **Spinner is three dots with staggered 160ms opacity fades**, not a
  rotating spinner. The brief is explicit that motion is "the trail draws
  forward… everything else is a 160ms opacity change. No bounces, no scale,
  no spring" — a spinning/rotating loader isn't itself one of those three
  motions, so I built the loading affordance out of the one motion primitive
  the system actually defines.
- **`GET /api/entries/:id` response shape.** `doc/assumptions.md` (backend
  agent, Phase 1) flags that architecture.md §4 reads two ways here and
  records what was actually implemented: `{ entry, parents, children, votes,
  todos }` as top-level siblings, `entry` itself in list form — not merged.
  `EntryDetailResponse` in `src/api/types.ts` and the `useEntry` hook are
  typed against that confirmed behaviour, not the more ambiguous prose.
- **`unassigned=true` overrides `kind`.** Same assumptions.md entry: the
  library scope always wins over any `kind` param also passed. The MSW mock
  mirrors this.

## Known gaps

- **No live visual check against a real browser was possible in this
  environment** — no Chrome extension was connected, so `/design` was
  verified via `DesignGallery.test.tsx` (renders every section through React
  Testing Library) plus a manual `curl` against the dev server, not a
  screenshot. Worth a visual pass before shipping.
- **Modal/Drawer focus handling is partial.** Focus moves into the dialog on
  open and Escape closes it, but there's no full focus-trap loop — Tab can
  still walk focus out of an open dialog. Fine for this foundation phase;
  flagged for whoever builds the real entry-detail flow on top of `Drawer`.
- **`:focus-visible` isn't verified pixel-for-pixel in tests.** jsdom doesn't
  compute pseudo-class styles, so component tests assert *focusability* (tab
  order, `document.activeElement`) and the CSS-module class contract, not the
  rendered 3px apricot outline itself. Verify visually via `/design`.
- **The MSW fixture store is intentionally small** (one seeded trip, a
  handful of entries/todos/votes) and doesn't enforce every backend
  invariant (e.g. cycle detection on links). It exists so the frontend and
  its tests run standalone, not as a spec-complete backend stand-in.
- **Route screens are structural placeholders.** Everything under
  `src/routes/` other than `SignIn` and `DesignGallery` renders a
  `PageHeader` + `EmptyState` — Phase 3/4 replaces the body, not the shell.
