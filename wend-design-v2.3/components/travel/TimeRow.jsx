import React from 'react';

export function TimeRow({ time, title, meta, state = 'waiting', onDark = false, trailing, ...rest }) {
  const dotColor = { decided: 'var(--stop-decided)', open: 'var(--stop-open)', destination: 'var(--stop-destination)', waiting: 'var(--stop-waiting)' }[state];
  const open = state === 'open';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto 20px 1fr auto', alignItems: 'start',
      gap: 'var(--space-3)', padding: 'var(--space-3) 0', minHeight: 'var(--tap-min)',
      fontFamily: 'var(--font-sans)',
    }} {...rest}>
      <span style={{
        fontSize: 'var(--text-data-size)', letterSpacing: 'var(--text-data-tracking)',
        color: onDark ? 'var(--text-on-dark)' : 'var(--text-strong)', minWidth: 108, paddingTop: 1,
      }}>{time}</span>
      <span style={{ display: 'flex', justifyContent: 'center', paddingTop: 7 }}>
        <span style={{
          width: open ? 14 : 10, height: open ? 14 : 10, borderRadius: '50%',
          background: open ? 'transparent' : dotColor,
          border: open ? `3px solid ${dotColor}` : 'none', display: 'block',
        }} />
      </span>
      <span style={{ display: 'grid', gap: 2 }}>
        <span style={{
          fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-body-size)',
          color: onDark ? 'var(--text-on-dark)' : 'var(--text-strong)', lineHeight: 1.4,
        }}>{title}</span>
        {meta && <span style={{
          fontSize: 'var(--text-small-size)', lineHeight: 1.5,
          color: onDark ? 'var(--text-on-dark-muted)' : 'var(--text-muted)',
        }}>{meta}</span>}
      </span>
      {trailing && <span style={{ display: 'flex', alignItems: 'center' }}>{trailing}</span>}
    </div>
  );
}
