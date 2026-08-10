import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import styles from './Trail.module.css';

export type TrailStopState = 'decided' | 'open' | 'waiting' | 'destination';

interface StopPreset {
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

const PRESET: Record<TrailStopState, StopPreset> = {
  decided: { r: 7, fill: 'var(--stop-decided)', stroke: 'none', strokeWidth: 0 },
  open: { r: 8, fill: 'transparent', stroke: 'var(--stop-open)', strokeWidth: 3.5 },
  waiting: { r: 5, fill: 'var(--stop-waiting)', stroke: 'none', strokeWidth: 0 },
  destination: { r: 6, fill: 'var(--stop-destination)', stroke: 'none', strokeWidth: 0 },
};

export interface TrailProps extends HTMLAttributes<HTMLDivElement> {
  /** One entry per pass, in order. Exactly one stop should be 'open'. */
  stops?: TrailStopState[];
  /** Optional caption per stop, e.g. ['Brainstorm', 'Gather', 'Schedule']. */
  labels?: string[];
  /** Set on deep-leaf surfaces. */
  onDark?: boolean;
  /** SVG height in px. Default 46. */
  height?: number;
  /**
   * Called with the stop index when its label is activated. Supplying this makes
   * labels real buttons (keyboard + pointer), matching "selecting a completed
   * stop returns to that step". Omit for a purely decorative trail.
   */
  onSelectStop?: (index: number) => void;
}

/**
 * The only navigation metaphor in Wend: a dotted path whose stops record the
 * three passes (Brainstorm → Gather → Schedule). Path geometry is generated the
 * same way as the source prototype so the curve is identical for any stop count.
 */
export const Trail = forwardRef<HTMLDivElement, TrailProps>(function Trail(
  { stops = [], labels, onDark = false, height = 46, onSelectStop, className, ...rest },
  ref,
) {
  const n = Math.max(stops.length, 2);
  const pts = stops.map((state, i) => ({
    x: 18 + i * ((282 - 18) / (n - 1)),
    y: i % 2 === 0 ? 32 : 14,
    state,
  }));
  const d = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`;
    const prev = pts[i - 1];
    if (!prev) return acc;
    const mx = (prev.x + p.x) / 2;
    return `${acc} C ${mx} ${prev.y}, ${mx} ${p.y}, ${p.x} ${p.y}`;
  }, '');

  return (
    <div ref={ref} className={[styles.trail, className].filter(Boolean).join(' ')} {...rest}>
      <svg width="100%" height={height} viewBox="0 0 300 46" preserveAspectRatio="none" fill="none" aria-hidden="true">
        <path
          d={d}
          stroke={onDark ? 'var(--trail-line-on-dark)' : 'var(--trail-line)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="1 7"
        />
        {pts.map((p, i) => {
          const preset = PRESET[p.state] ?? PRESET.waiting;
          const fill =
            preset.fill === 'transparent' ? (onDark ? 'var(--surface-inverse)' : 'var(--surface-card)') : preset.fill;
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={preset.r}
              fill={fill}
              stroke={preset.stroke}
              strokeWidth={preset.strokeWidth}
            />
          );
        })}
      </svg>
      {labels && (
        <div className={styles.labels}>
          {labels.map((label, i) => {
            const waiting = stops[i] === 'waiting';
            // Only decided/open/destination stops can be selected back to — a
            // step you haven't reached yet ('waiting') isn't a valid target.
            const clickable = Boolean(onSelectStop) && !waiting;
            const commonProps = {
              className: [styles.label, clickable ? styles.labelButton : ''].filter(Boolean).join(' '),
              'data-on-dark': onDark ? 'true' : 'false',
              'data-waiting': waiting ? 'true' : 'false',
            } as const;
            if (clickable) {
              return (
                <button key={i} type="button" {...commonProps} onClick={() => onSelectStop?.(i)}>
                  {label}
                </button>
              );
            }
            return (
              <span key={i} {...commonProps}>
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});
