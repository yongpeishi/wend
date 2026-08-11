
function TodayScreen() {
  const { TimeRow, Label, Button, Trail } = window.WendDesignSystem_c7e2ae;
  const { today } = window.WEND_ROAD;
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', padding: 'var(--space-6) 0 var(--space-4)' }}>
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <Label tone="onDark">Thursday 17 · east, then north</Label>
        <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-display-size)', lineHeight: 'var(--text-display-line)', color: 'var(--text-on-dark)' }}>Nanzen-ji, now</span>
        <span style={{ fontSize: 'var(--text-body-size)', lineHeight: 1.6, color: 'var(--text-on-dark-muted)' }}>Until 11:40. The aqueduct is round the back, past the hall.</span>
      </div>
      <Trail onDark stops={['decided', 'open', 'waiting', 'waiting', 'destination']} height={40} />
      <div style={{ borderTop: 'var(--border-width) solid var(--trail-line-on-dark)', paddingTop: 'var(--space-2)' }}>
        {today.map(r => <TimeRow key={r.time} onDark {...r} />)}
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-3)', paddingTop: 'var(--space-2)' }}>
        <Button variant="onDark">Take the long way</Button>
        <span style={{ fontSize: 'var(--text-small-size)', lineHeight: 1.6, color: 'var(--text-on-dark-muted)' }}>You'll get there. Slowly is fine.</span>
      </div>
    </div>
  );
}
Object.assign(window, { TodayScreen });
