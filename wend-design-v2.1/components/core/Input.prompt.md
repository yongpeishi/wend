Single-line text entry.

```jsx
<Input placeholder="Search" leading={<Search size={18} strokeWidth={1.5} />} hint="↵" />
<Input value="Kyoto" focused trailing={<X size={18} strokeWidth={1.5} />} />
```

Placeholders ask a plain question rather than naming a field. Icons sit at 18px, 1.5px stroke, in `--text-muted`; they never carry meaning the text does not also carry. The field's own border is the only structure — never nest a second box around an icon slot.
