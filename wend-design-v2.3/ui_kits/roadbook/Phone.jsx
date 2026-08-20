
function Phone({ tab, onTab, dark, children }) {
  const { Logo, Label } = window.WendDesignSystem_c7e2ae;
  const tabs = ['Today', 'Days', 'Kept'];
  return (
    <div style={{
      width: 390, height: 844, borderRadius: 'var(--radius-screen)', overflow: 'hidden',
      background: dark ? 'var(--surface-inverse)' : 'var(--surface-page)',
      border: 'var(--border-width) solid var(--border-strong)',
      display: 'grid', gridTemplateRows: 'auto 1fr auto', fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ padding: '14px var(--gutter-screen) 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-code-size)', color: dark ? 'var(--text-on-dark-muted)' : 'var(--text-muted)' }}>09:52</span>
        <Logo size={18} variant={dark ? 'reversed' : 'primary'} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-code-size)', color: dark ? 'var(--text-on-dark-muted)' : 'var(--text-muted)' }}>82%</span>
      </div>
      <div style={{ overflowY: 'auto', padding: '0 var(--gutter-screen)' }}>{children}</div>
      <nav style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        borderTop: `var(--border-width) solid ${dark ? 'var(--trail-line-on-dark)' : 'var(--border-subtle)'}`,
      }}>
        {tabs.map((t, i) => (
          <button key={t} onClick={() => onTab(i)} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', minHeight: 'var(--tap-min)',
            padding: '14px 0 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i === tab ? 'var(--stop-open)' : 'transparent',
              border: i === tab ? 'none' : `2px solid ${dark ? 'var(--trail-line-on-dark)' : 'var(--border-strong)'}`,
            }} />
            <Label tone={i === tab ? (dark ? 'onDark' : 'strong') : (dark ? 'onDark' : 'muted')} style={i === tab && dark ? { color: 'var(--text-on-dark)' } : undefined}>{t}</Label>
          </button>
        ))}
      </nav>
    </div>
  );
}
Object.assign(window, { Phone });
