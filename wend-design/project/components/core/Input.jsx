import React from 'react';

export function Input({ value, placeholder, focused = false, hint, ...rest }) {
  return (
    <div style={{
      background: 'var(--surface-card)',
      border: `var(--border-width) solid ${focused ? 'var(--focus-ring)' : 'var(--border-strong)'}`,
      borderRadius: 'var(--radius-card)',
      padding: '14px 16px',
      minHeight: 'var(--tap-min)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)',
      outline: focused ? `var(--focus-width) solid var(--focus-ring-wash)` : 'none',
      fontFamily: 'var(--font-sans)',
    }} {...rest}>
      <span style={{ fontSize: 'var(--text-body-size)', color: value ? 'var(--text-strong)' : 'var(--text-muted)' }}>
        {value || placeholder}
      </span>
      {hint && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-code-size)', color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  );
}
