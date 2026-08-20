One-line: the small circular control that keeps an idea in the shortlist — the hit area is always at least 48×48 even though the dot is small.

```jsx
<KeepToggle kept={kept} label="Keep Nanzen-ji" onToggle={() => setKept(!kept)} />
```

Kept is a filled plum dot (plum means saved / destination). Unkept is a 2px open ring. Unkept means set aside, not rejected — it stays in the shortlist. Deleting is a separate action: an explicit Delete with a confirmation naming the thing, then an undo.
