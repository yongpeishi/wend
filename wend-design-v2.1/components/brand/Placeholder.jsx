import React from 'react';

export function Placeholder({ height = 120, radius = 'media', caption, style, ...rest }) {
  return (
    <div style={{
      height,
      background: 'var(--placeholder-hatch)',
      borderRadius: radius === 'card' ? 'var(--radius-card)' : radius === 'none' ? 0 : 'var(--radius-media)',
      display: 'flex', alignItems: 'flex-end', padding: 'var(--space-2)',
      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-code-size)', color: 'var(--text-muted)',
      ...style,
    }} {...rest}>{caption}</div>
  );
}
