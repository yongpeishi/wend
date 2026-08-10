import React from 'react';

export function Button({ variant = 'primary', disabled = false, focused = false, children, ...rest }) {
  const base = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--weight-bold)',
    fontSize: 'var(--text-small-size)',
    minHeight: 'var(--tap-min)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'default' : 'pointer',
    border: 'none',
    boxShadow: 'var(--shadow-none)',
    transition: 'opacity var(--motion-fade-duration) var(--motion-fade-ease)',
    outline: focused ? 'var(--focus-width) solid var(--focus-ring)' : 'none',
    outlineOffset: 'var(--focus-offset)',
  };
  const styles = {
    primary: {
      background: disabled ? 'var(--surface-disabled)' : 'var(--action-primary)',
      color: disabled ? 'var(--action-disabled-text)' : 'var(--action-primary-text)',
      padding: '14px 26px',
      borderRadius: 'var(--radius-pill)',
    },
    secondary: {
      background: 'transparent',
      color: 'var(--text-strong)',
      padding: '12px 24px',
      borderRadius: 'var(--radius-pill)',
      border: 'var(--border-width-strong) solid var(--action-primary)',
    },
    quiet: {
      background: 'transparent',
      color: 'var(--action-primary)',
      padding: '12px 4px',
      borderRadius: 0,
      borderBottom: 'var(--border-width-strong) solid var(--action-primary)',
    },
    onDark: {
      background: 'transparent',
      color: 'var(--text-on-dark)',
      padding: '12px 24px',
      borderRadius: 'var(--radius-pill)',
      border: 'var(--border-width-strong) solid var(--wend-leaf-soft)',
    },
  };
  return <button disabled={disabled} style={{ ...base, ...styles[variant] }} {...rest}>{children}</button>;
}
