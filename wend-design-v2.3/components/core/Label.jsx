import React from 'react';

export function Label({ tone = 'muted', as: As = 'span', children, style, ...rest }) {
  const colors = {
    muted: 'var(--text-muted)',
    strong: 'var(--text-strong)',
    onDark: 'var(--text-on-dark-muted)',
    saved: 'var(--stop-destination)',
  };
  return (
    <As style={{
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 'var(--text-label-size)',
      letterSpacing: 'var(--text-label-tracking)',
      textTransform: 'uppercase',
      color: colors[tone],
      ...style,
    }} {...rest}>{children}</As>
  );
}
