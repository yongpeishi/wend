One-line: the neutral surface container — use it wherever content sits above the page, and never add a shadow.

```jsx
<Card bordered padding="var(--space-6)">
  <Label>Morning</Label>
  <p>Two temples and a long walk between them.</p>
</Card>
```

Variants: `tone="card"` (default, #FBFCFA), `tone="page"` (flush with the page, for grouping only), `tone="inverse"` (deep leaf — the finished day plan read outdoors). `radius` follows the shape tokens: 6px cards, 14px media, 22px phone surfaces.
