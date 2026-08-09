import React from 'react';

export function Chip({ selected = false, tone = 'default', children, ...rest }) {
  const tones = {
    default: selected
      ? { background: 'var(--action-primary)', color: 'var(--action-primary-text)', border: 'none', padding: '10px 16px', fontWeight: 'var(--weight-bold)' }
      : { background: 'transparent', color: 'var(--text-body)', border: 'var(--border-width) solid var(--border-strong)', padding: '9px 16px', fontWeight: 'var(--weight-regular)' },
    saved: { background: 'var(--wend-plum-wash)', color: 'var(--stop-destination)', border: 'none', padding: '10px 16px', fontWeight: 'var(--weight-bold)' },
  };
  return (
    <span style={{
      fontFamily: 'var(--font-sans)', fontSize: 'var(--text-min-size)',
      borderRadius: 'var(--radius-pill)', display: 'inline-flex', alignItems: 'center',
      cursor: 'pointer', ...tones[tone],
    }} {...rest}>{children}</span>
  );
}
