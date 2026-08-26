# Building with Wend

Wend is a travel-planning product. Planning happens at a desk (desktop-first, several
options side by side); the finished plan is read on a phone in bright sun (mobile-first,
large type, high contrast).

## Setup — no provider

There is no ThemeProvider, no context, no theme object. Components are plain React with
CSS Modules, and every token is a plain CSS custom property defined on `:root`. Link the
one stylesheet and the components are styled:

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

`styles.css` is the whole closure — tokens, the remote Google Fonts import, and
`_ds_bundle.css`. Miss it and every `var(--*)` falls back to nothing and the components
render as unstyled browser defaults. There is no other setup step.

## The styling idiom: CSS custom properties

There are **no utility classes and no style props**. Style your own layout with
`var(--token)` in inline styles or your own CSS. Never write the DS's own class names
(`.Button_button` and friends are hashed CSS-Module output — they are not API).

| Family | Names |
|---|---|
| Surfaces | `--surface-page` (paper), `--surface-card`, `--surface-inverse` (deep leaf), `--surface-disabled`, `--overlay-scrim` |
| Text | `--text-strong`, `--text-body`, `--text-muted`, `--text-on-dark`, `--text-on-dark-muted`, `--text-error`, `--text-success` |
| Action | `--action-primary`, `--action-primary-text`, `--action-destructive`, `--action-destructive-text` |
| Feedback | `--feedback-success` (jade), `--feedback-error` (rust), `--feedback-pending`, `--border-success`, `--border-error` |
| Trail | `--stop-decided`, `--stop-open`, `--stop-waiting`, `--stop-destination`, `--trail-line`, `--trail-line-on-dark` |
| Borders / focus | `--border-subtle`, `--border-strong`, `--border-width` (1.5px), `--border-width-strong` (2px), `--focus-ring`, `--focus-width`, `--focus-offset` |
| Spacing | `--space-1` … `--space-16` (4·8·12·16·24·32·48·64), `--gutter-screen`, `--floor-screen`, `--gap-list-row`, `--gap-section`, `--tap-min` (48px) |
| Shape | `--radius-card` (12), `--radius-media` (10), `--radius-screen` (22), `--radius-pill`, `--shadow-none` |
| Type | `--font-sans`, `--font-mono`, `--weight-regular`, `--weight-bold`, `--text-display-size` … `--text-code-size`, `--text-label-tracking`, `--wordmark-tracking`, `--measure-body` |
| Motion | `--motion-trail-duration` (420ms), `--motion-fade-duration` (160ms), and their `-ease` partners |

## Rules that are not negotiable

- **Rust fills exactly one control**: `<Button variant="destructive">`. Everywhere else
  rust is a border, an icon or text. A filled red rectangle means a click destroys something.
- **Jade never fills a control.** It borders, ticks and writes. It is cooler and brighter
  than `--action-primary` on purpose, so a confirmation never reads as a button.
- **Apricot is a shape, never a text colour** — a ring, a focus outline, an underline. It
  means one thing: *you are here*.
- **No shadows** (`--shadow-none`), no blur, no transparency except `--overlay-scrim`.
- **Buttons name the outcome**: "Save trip", "Add scenic route", "Delete". Movement verbs
  ("Take the long way") are headings, never labels — put the warmth in helper text beside
  the control.
- Sentence case everywhere except labels (uppercase, `--text-label-tracking`) and the
  wordmark. **No emoji, no exclamation marks, never urgent or scarce.**
- Errors name the fix, not the fault: "Enter a date in 2026 or later."
- 24-hour times (`09:40`), en-dash ranges (`10:15–11:40`), middot metadata (`morning · east`).
- Touch targets are `--tap-min` (48px). `<Button size="small">` sits under it deliberately —
  never make it the only way to reach a primary action.

## Dark surfaces

There is no dark mode. "On dark" means a deep-leaf panel inside a light page: set
`background: var(--surface-inverse)` yourself, then pass `variant="onDark"` to `Button`,
`variant="reversed"` to `Logo`, and `onDark` to `Trail`.

## Where the truth lives

Read the real files before styling: `styles.css` and its `@import`s (especially
`tokens/colors.css`), and `components/<group>/<Name>/<Name>.prompt.md` for any component
you are about to use — each carries the author's own reasoning about when to reach for it.

## An idiomatic snippet

```jsx
const { Button, Chip, Input, Trail } = window.WendDesignSystem;

<div style={{ padding: 'var(--space-6)', background: 'var(--surface-card)',
              borderRadius: 'var(--radius-card)', border: 'var(--border-width) solid var(--border-subtle)',
              display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
  <Trail stops={['decided', 'open', 'waiting']} labels={['Brainstorm', 'Gather', 'Schedule']} />
  <span style={{ fontSize: 'var(--text-label-size)', letterSpacing: 'var(--text-label-tracking)',
                 textTransform: 'uppercase', color: 'var(--text-muted)' }}>Destination</span>
  <Input placeholder="Where are you going?" hint="↵" />
  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
    <Chip selected>Temples</Chip>
    <Chip>Food</Chip>
  </div>
  <Button variant="primary">Save trip</Button>
</div>
```
