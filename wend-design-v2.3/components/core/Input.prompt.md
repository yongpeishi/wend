Every field carries a label in plain, expected words. The placeholder may ask a question; it never replaces the label.

```jsx
<Input label="Destination" placeholder="Where are you going?" />
<Input label="Arrival date" value="2026-04-08" state="success" message="Saved to your trip." />
<Input label="Arrival date" value="2024-04-08" state="error" message="Enter a date in 2026 or later." />
<Input label="Trip name" value="Kyoto in spring" state="pending" message="Checking for a duplicate." />
```

## Feedback

- **error** — rust border, bold rust message, `role="alert"`. The message names the fix ("Enter a date in 2026 or later."), never blames ("Invalid input"). Never urgent.
- **success** — jade border and tick, jade message. Success is confirmation, not celebration: one short sentence. Jade never fills a button; it only marks, borders and writes.
- **pending** — monospaced `checking…` in the trailing slot. No spinners; the type carries it.
- Validate on blur, not per keystroke. An error that appears while someone is still typing reads as scolding.
