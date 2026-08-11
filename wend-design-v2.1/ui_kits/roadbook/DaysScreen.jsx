
function DaysScreen() {
  const { Card, Label } = window.WendDesignSystem_c7e2ae;
  const { days } = window.WEND_ROAD;
  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)', padding: 'var(--space-6) 0 var(--space-4)' }}>
      <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title-size)', color: 'var(--text-strong)' }}>Six days in Kyoto</span>
      {days.map(d => (
        <Card key={d.day} bordered padding="var(--space-4)" style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-3)', alignItems: 'start',
          outline: d.today ? 'var(--focus-width) solid var(--focus-ring)' : 'none', outlineOffset: 'var(--focus-offset)',
        }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', marginTop: 5, background: d.today ? 'transparent' : 'var(--stop-decided)', border: d.today ? '3px solid var(--stop-open)' : 'none' }} />
          <span style={{ display: 'grid', gap: 4 }}>
            <Label tone="strong">{d.day}</Label>
            <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-body-size)', color: 'var(--text-strong)' }}>{d.head}</span>
            <span style={{ fontSize: 'var(--text-small-size)', color: 'var(--text-muted)' }}>{d.meta}</span>
          </span>
        </Card>
      ))}
    </div>
  );
}
Object.assign(window, { DaysScreen });
