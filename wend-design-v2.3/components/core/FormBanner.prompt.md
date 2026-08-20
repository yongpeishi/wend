Appears only after a submit attempt, directly above the first field, and disappears once the form is clean.

```jsx
<FormBanner tone="error" title="Two things need a look" items={['Arrival date — enter a date in 2026 or later.', 'Travellers — enter a number.']} />
<FormBanner tone="success" title="Trip saved." >Six days, nothing locked in.</FormBanner>
```

Field-level messages stay in place even when a banner is shown — the banner is a summary, not a replacement. Never count problems dramatically ("3 errors!"); say what needs a look.
