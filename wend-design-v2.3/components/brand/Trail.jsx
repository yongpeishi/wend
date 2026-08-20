import React from 'react';

const PRESET = {
  decided: { d: 14, fill: 'var(--stop-decided)', border: 'none' },
  open: { d: 16, fill: 'transparent', border: '3.5px solid var(--stop-open)' },
  waiting: { d: 10, fill: 'var(--stop-waiting)', border: 'none' },
  destination: { d: 12, fill: 'var(--stop-destination)', border: 'none' },
};

export function Trail({ stops = [], labels, onDark = false, height = 46, ...rest }) {
  const n = Math.max(stops.length, 2);
  const fx = i => 6 + i * (88 / (n - 1));
  const fy = i => (i % 2 === 0 ? 0.7 : 0.3);
  const pts = stops.map((s, i) => ({ x: (fx(i) / 100) * 300, y: fy(i) * height, state: s }));
  const d = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`;
    const prev = pts[i - 1];
    const mx = (prev.x + p.x) / 2;
    return `${acc} C ${mx} ${prev.y}, ${mx} ${p.y}, ${p.x} ${p.y}`;
  }, '');

  return (
    <div {...rest}>
      <div style={{ position: 'relative', height, width: '100%' }}>
        <svg width="100%" height={height} viewBox={`0 0 300 ${height}`} preserveAspectRatio="none" fill="none" aria-hidden="true" style={{ display: 'block' }}>
          <path d={d} stroke={onDark ? 'var(--trail-line-on-dark)' : 'var(--trail-line)'} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 7" vectorEffect="non-scaling-stroke" />
        </svg>
        {stops.map((s, i) => {
          const p = PRESET[s] || PRESET.waiting;
          return (
            <span key={i} style={{
              position: 'absolute', left: `${fx(i)}%`, top: fy(i) * height,
              transform: 'translate(-50%, -50%)',
              width: p.d, height: p.d, borderRadius: '50%', boxSizing: 'border-box',
              background: p.fill === 'transparent' ? (onDark ? 'var(--surface-inverse)' : 'var(--surface-card)') : p.fill,
              border: p.border,
            }} />
          );
        })}
      </div>
      {labels && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-3)' }}>
          {labels.map((l, i) => (
            <span key={i} style={{
              fontFamily: 'var(--font-sans)', fontWeight: 'var(--weight-bold)',
              fontSize: 'var(--text-label-size)', letterSpacing: 'var(--text-label-tracking)',
              textTransform: 'uppercase',
              color: stops[i] === 'waiting'
                ? (onDark ? 'var(--text-on-dark-muted)' : 'var(--text-muted)')
                : (onDark ? 'var(--text-on-dark)' : 'var(--text-strong)'),
            }}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
