import React from 'react';

const PRESET = {
  decided: { r: 7, fill: 'var(--stop-decided)', stroke: 'none', w: 0 },
  open: { r: 8, fill: 'transparent', stroke: 'var(--stop-open)', w: 3.5 },
  waiting: { r: 5, fill: 'var(--stop-waiting)', stroke: 'none', w: 0 },
  destination: { r: 6, fill: 'var(--stop-destination)', stroke: 'none', w: 0 },
};

export function Trail({ stops = [], labels, onDark = false, height = 46, ...rest }) {
  const n = Math.max(stops.length, 2);
  const pts = stops.map((s, i) => ({
    x: 18 + i * ((282 - 18) / (n - 1)),
    y: i % 2 === 0 ? 32 : 14,
    state: s,
  }));
  const d = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`;
    const prev = pts[i - 1];
    const mx = (prev.x + p.x) / 2;
    return `${acc} C ${mx} ${prev.y}, ${mx} ${p.y}, ${p.x} ${p.y}`;
  }, '');

  return (
    <div {...rest}>
      <svg width="100%" height={height} viewBox="0 0 300 46" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <path d={d} stroke={onDark ? 'var(--trail-line-on-dark)' : 'var(--trail-line)'} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 7" />
        {pts.map((p, i) => {
          const s = PRESET[p.state] || PRESET.waiting;
          return (
            <circle key={i} cx={p.x} cy={p.y} r={s.r}
              fill={s.fill === 'transparent' ? (onDark ? 'var(--surface-inverse)' : 'var(--surface-card)') : s.fill}
              stroke={s.stroke} strokeWidth={s.w} />
          );
        })}
      </svg>
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
