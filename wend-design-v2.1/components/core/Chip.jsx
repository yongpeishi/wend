import React from 'react';

export function Chip({ selected = false, children, ...rest }) {
  const look = selected
    ? { background: 'var(--action-primary)', color: 'var(--action-primary-text)', border: 'none', padding: '10px 16px', fontWeight: 'var(--weight-bold)' }
    : { background: 'transparent', color: 'var(--text-body)', border: 'var(--border-width) solid var(--border-strong)', padding: '9px 16px', fontWeight: 'var(--weight-regular)' };
  return (
    <span style={{
      fontFamily: 'var(--font-sans)', fontSize: 'var(--text-min-size)',
      borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center',
      cursor: 'pointer', ...look,
    }} {...rest}>{children}</span>
  );
}
