import React from 'react';

const BORDER = { success: 'var(--border-success)', error: 'var(--border-error)' };
const MSG_COLOR = { success: 'var(--text-success)', error: 'var(--text-error)', pending: 'var(--feedback-pending)', default: 'var(--text-muted)' };

export function Input({ value, placeholder, label, state = 'default', message, focused = false, leading, trailing, hint, ...rest }) {
  const mono = { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-code-size)' };
  let auto = null;
  if (state === 'success') auto = <span style={{ ...mono, color: 'var(--feedback-success)' }} aria-hidden="true">✓</span>;
  if (state === 'pending') auto = <span style={{ ...mono, color: 'var(--feedback-pending)' }}>checking…</span>;
  const trail = trailing ?? (hint ? <span style={{ ...mono, color: 'var(--text-muted)' }}>{hint}</span> : auto);
  const border = BORDER[state] ?? (focused ? 'var(--focus-ring)' : 'var(--border-strong)');
  const field = (
    <div style={{
      background: 'var(--surface-card)',
      border: `var(--border-width) solid ${border}`,
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
  if (!label && !message) return field;
  return (
    <div style={{ display: 'grid', gap: 'var(--space-2)', fontFamily: 'var(--font-sans)' }}>
      {label && (
        <span style={{ fontSize: 'var(--text-label-size)', letterSpacing: 'var(--text-label-tracking)', textTransform: 'uppercase', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)' }}>{label}</span>
      )}
      {field}
      {message && (
        <span role={state === 'error' ? 'alert' : undefined} style={{
          fontSize: 'var(--text-small-size)', lineHeight: 1.5,
          color: MSG_COLOR[state] ?? MSG_COLOR.default,
          fontWeight: state === 'error' ? 'var(--weight-bold)' : 'var(--weight-regular)',
        }}>{message}</span>
      )}
    </div>
  );
}
