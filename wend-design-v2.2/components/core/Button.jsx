import React from 'react';

const PADDING = {
  primary: { small: '7px 16px', medium: '14px 26px', large: '18px 34px' },
  secondary: { small: '5px 14px', medium: '12px 24px', large: '16px 32px' },
  quiet: { small: '6px 2px', medium: '12px 4px', large: '15px 4px' },
  onDark: { small: '5px 14px', medium: '12px 24px', large: '16px 32px' },
};
const FONT_SIZE = { small: 'var(--text-small-size)', medium: 'var(--text-small-size)', large: 'var(--text-body-size)' };
const MIN_HEIGHT = { small: '36px', medium: 'var(--tap-min)', large: '56px' };

export function Button({ variant = 'primary', size = 'medium', disabled = false, focused = false, children, ...rest }) {
  const base = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--weight-bold)',
    fontSize: FONT_SIZE[size],
    minHeight: MIN_HEIGHT[size],
    padding: PADDING[variant][size],
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
      borderRadius: 'var(--radius-card)',
    },
    secondary: {
      background: 'transparent',
      color: 'var(--text-strong)',
      borderRadius: 'var(--radius-card)',
      border: 'var(--border-width-strong) solid var(--action-primary)',
    },
    quiet: {
      background: 'transparent',
      color: 'var(--action-primary)',
      borderRadius: 0,
      borderBottom: 'var(--border-width-strong) solid var(--action-primary)',
    },
    onDark: {
      background: 'transparent',
      color: 'var(--text-on-dark)',
      borderRadius: 'var(--radius-card)',
      border: 'var(--border-width-strong) solid var(--wend-leaf-soft)',
    },
  };
  return <button disabled={disabled} style={{ ...base, ...styles[variant] }} {...rest}>{children}</button>;
}
