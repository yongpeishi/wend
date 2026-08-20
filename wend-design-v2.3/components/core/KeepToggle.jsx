import React from 'react';

export function KeepToggle({ kept = false, size = 48, label = 'Keep', onToggle, ...rest }) {
  const dot = Math.round(size * 0.46);
  return (
    <button
      type="button"
      aria-pressed={kept}
      aria-label={kept ? label + ' — kept' : label}
      onClick={onToggle}
      style={{
        width: size, height: size, minWidth: size,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
        borderRadius: '50%',
        transition: 'opacity var(--motion-fade-duration) var(--motion-fade-ease)',
      }}
      {...rest}
    >
      <span style={{
        width: dot, height: dot, borderRadius: '50%', display: 'block',
        background: kept ? 'var(--stop-destination)' : 'transparent',
        border: kept ? 'none' : 'var(--border-width-strong) solid var(--border-strong)',
      }} />
    </button>
  );
}
