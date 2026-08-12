import React from 'react';

export function Logo({ variant = 'primary', size = 40, showWordmark = true, ...rest }) {
  const trail = variant === 'reversed' ? 'var(--trail-line-on-dark)' : 'var(--stop-decided)';
  const open = variant === 'reversed' ? 'var(--surface-inverse)' : 'var(--surface-page)';
  const start = variant === 'reversed' ? 'var(--text-on-dark)' : 'var(--stop-decided)';
  const end = variant === 'reversed' ? 'var(--wend-plum-tint)' : 'var(--stop-destination)';
  const word = variant === 'reversed' ? 'var(--text-on-dark)' : 'var(--text-strong)';
  const small = size <= 28;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.36 }} {...rest}>
      <svg width={size * 1.33} height={size} viewBox="0 0 96 72" fill="none" role="img" aria-label="Wend" style={{ display: 'block' }}>
        <path d="M10 60 C 10 34, 44 46, 44 26 C 44 10, 74 12, 82 30" stroke={trail} strokeWidth={small ? 5 : 3} strokeLinecap="round" strokeDasharray={small ? '1 7' : '1 8'} />
        <circle cx="10" cy="60" r={small ? 9 : 7} fill={start} />
        <circle cx="44" cy="26" r={small ? 11 : 9} fill={open} stroke="var(--stop-open)" strokeWidth={small ? 5 : 3.5} />
        <circle cx="82" cy="30" r={small ? 8 : 6} fill={end} />
      </svg>
      {showWordmark && (
        <span style={{
          fontFamily: 'var(--font-sans)', fontWeight: 'var(--weight-bold)',
          fontSize: size * 0.72, letterSpacing: 'var(--wordmark-tracking)',
          textTransform: 'uppercase', color: word, lineHeight: 1,
          display: 'inline-block', paddingLeft: size * 0.06,
        }}>Wend</span>
      )}
    </span>
  );
}
