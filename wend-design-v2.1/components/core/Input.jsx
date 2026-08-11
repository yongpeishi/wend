import React from 'react';

export function Input({ value, placeholder, focused = false, leading, trailing, hint, ...rest }) {
  const trail = trailing ?? (hint ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-code-size)', color: 'var(--text-muted)' }}>{hint}</span> : null);
  return (
    <div style={{
      background: 'var(--surface-card)',
      border: `var(--border-width) solid ${focused ? 'var(--focus-ring)' : 'var(--border-strong)'}`,
      borderRadius: 'var(--radius-card)',
      padding: '14px 16px',
      minHeight: 'var(--tap-min)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      outline: focused ? `var(--focus-width) solid var(--focus-ring-wash)` : 'none',
      fontFamily: 'var(--font-sans)',
    }} {...rest}>
      {leading && <span style={{ display: 'flex', color: 'var(--text-muted)', flexShrink: 0 }}>{leading}</span>}
      <span style={{ flex: 1, fontSize: 'var(--text-body-size)', color: value ? 'var(--text-strong)' : 'var(--text-muted)' }}>
        {value || placeholder}
      </span>
      {trail && <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>{trail}</span>}
    </div>
  );
}
