import type { CSSProperties } from 'react';
import { formatDuration, joinMeta } from '../../lib/formatDates';
import type { Entry } from '../../api/types';
import styles from './TransportSegment.module.css';

export interface TransportSegmentProps {
  entry: Entry | undefined;
  style: CSSProperties;
  heightPx: number;
}

/**
 * The brand's one figure doing real work: a dotted trail segment between two
 * located blocks, standing in for a transport Entry. Same dash idiom as
 * `<Trail>` (1 7 dasharray, round caps) rotated vertical for the day column.
 */
export function TransportSegment({ entry, style, heightPx }: TransportSegmentProps) {
  const duration = formatDuration(entry?.duration_minutes ?? null);
  const meta = joinMeta(entry?.title ?? 'Transport', duration);

  return (
    <div className={styles.segment} style={style}>
      <svg
        className={styles.line}
        width="18"
        height={heightPx}
        viewBox={`0 0 18 ${heightPx}`}
        fill="none"
        aria-hidden="true"
      >
        <line
          x1="9"
          y1="4"
          x2="9"
          y2={Math.max(4, heightPx - 4)}
          stroke="var(--trail-line-on-dark)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="1 7"
        />
        <circle cx="9" cy="4" r="3" fill="var(--trail-line-on-dark)" />
        <circle cx="9" cy={Math.max(4, heightPx - 4)} r="3" fill="var(--trail-line-on-dark)" />
      </svg>
      <span className={styles.label}>{meta}</span>
    </div>
  );
}
