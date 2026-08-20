import React from 'react';

const TONE = {
  error: { border: 'var(--border-error)', wash: 'var(--feedback-error-wash)', text: 'var(--text-error)' },
  success: { border: 'var(--border-success)', wash: 'var(--feedback-success-wash)', text: 'var(--text-success)' },
};

export function FormBanner({ tone = 'error', title, items = [], children, ...rest }) {
  const t = TONE[tone] ?? TONE.error;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} style={{
      border: `var(--border-width) solid ${t.border}`,
      background: t.wash,
      borderRadius: 'var(--radius-card)',
      padding: '14px 16px',
      display: 'grid', gap: 'var(--space-2)',
      fontFamily: 'var(--font-sans)',
    }} {...rest}>
      {title && <span style={{ fontSize: 'var(--text-small-size)', fontWeight: 'var(--weight-bold)', color: t.text }}>{title}</span>}
      {items.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' }}>
          {items.map((it, i) => (
            <li key={i} style={{ fontSize: 'var(--text-small-size)', lineHeight: 1.5, color: 'var(--text-body)' }}>{it}</li>
          ))}
        </ul>
      )}
      {children && <span style={{ fontSize: 'var(--text-small-size)', lineHeight: 1.5, color: 'var(--text-body)' }}>{children}</span>}
    </div>
  );
}
