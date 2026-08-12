import React from 'react';

export function Card({ tone = 'card', bordered = false, radius = 'card', padding = 'var(--space-4)', children, style, ...rest }) {
  const tones = {
    card: { background: 'var(--surface-card)', color: 'var(--text-body)' },
    page: { background: 'var(--surface-page)', color: 'var(--text-body)' },
    inverse: { background: 'var(--surface-inverse)', color: 'var(--text-on-dark)' },
  };
  return (
    <div style={{
      ...tones[tone],
      padding,
      borderRadius: radius === 'media' ? 'var(--radius-media)' : radius === 'screen' ? 'var(--radius-screen)' : 'var(--radius-card)',
      border: bordered ? `var(--border-width) solid ${tone === 'inverse' ? 'var(--trail-line-on-dark)' : 'var(--border-subtle)'}` : 'none',
      boxShadow: 'var(--shadow-none)',
      fontFamily: 'var(--font-sans)',
      ...style,
    }} {...rest}>{children}</div>
  );
}
