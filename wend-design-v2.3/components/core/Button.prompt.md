One primary action per screen; everything else is secondary or quiet.

```jsx
<Button>Primary action</Button>
<Button variant="secondary">Secondary action</Button>
<Button variant="quiet">Skip</Button>
<Button variant="destructive">Delete</Button>
```

Focus is always a 3px apricot ring offset 3px — the same colour that means "you are here". Never write urgent or scarce copy on a button.

## Labels

A button label names what will happen, in the words a user would use: "Save trip", "Add scenic route", "Delete". Ambiguous movement verbs — "Take the long way", "Keep both for now" — belong in headings and confirmations, not on controls. If the outcome needs softening, put it in helper text under the button ("Adds about 40 minutes."), not in the label.

`destructive` is reserved for deletes. One per dialog, always beside a `secondary` Cancel, and never the default focus target.

## Size

`medium` is the default and covers nearly every case — screen-level primary/secondary actions, forms, dialogs. Reach for another size only when the row itself demands it:

- **small** — for a button living inside a compact, already-dense row: a search bar's "Start it", a list row's inline action, a toolbar. Never for a screen's only way to reach a primary action, and never on a touch target that's someone's sole way to complete a task — it sits under the 48px tap minimum on purpose, so restrict it to contexts backed by a mouse or by a redundant larger action elsewhere. Pair with `quiet` or `secondary`, rarely `primary` — a small primary button reads as a lightweight afterthought, which usually contradicts what primary means.
- **large** — for a single hero CTA above the fold, or a full-width action on mobile. Don't use it to make a routine action feel more important; that's a copy and hierarchy problem, not a sizing one.

If you find yourself reaching for small on a `primary` button, it's worth asking whether the action should be `quiet`/`secondary` instead, or whether the row needs redesigning to fit a medium button — shrinking the button is the easy fix, not always the right one.
