One-line: the unit of the brainstorm board — one idea, keepable, groupable, never deletable.

```jsx
<PlaceCard name="Nanzen-ji" meta="morning · east" note="Big aqueduct, quiet at opening." kept onToggle={keep} />
```

Text only — no media. Composes Card, Label and KeepToggle; don't re-implement those inside a screen. If a place needs a photograph, put a `<Placeholder>` beside the card, not inside it.
