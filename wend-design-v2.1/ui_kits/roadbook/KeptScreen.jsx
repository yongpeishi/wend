
function KeptScreen() {
  const { PlaceCard, Chip, Input } = window.WendDesignSystem_c7e2ae;
  const { kept } = window.WEND_ROAD;
  const [on, setOn] = React.useState({});
  const [filter, setFilter] = React.useState('Near me');
  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-6) 0 var(--space-4)' }}>
      <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title-size)', color: 'var(--text-strong)' }}>Kept nine places so far</span>
      <Input placeholder="Anything nearby?" hint="↵" />
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {['Near me', 'Today', 'Evening'].map(t => <Chip key={t} selected={filter === t} onClick={() => setFilter(t)}>{t}</Chip>)}
      </div>
      {kept.map(k => (
        <PlaceCard key={k.name} name={k.name} meta={k.meta} note={k.note}
          kept={on[k.name] ?? true} onToggle={() => setOn(s => ({ ...s, [k.name]: !(s[k.name] ?? true) }))} />
      ))}
    </div>
  );
}
Object.assign(window, { KeptScreen });
