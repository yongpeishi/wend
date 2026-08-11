import * as React from 'react';

/**
 * One line of the hourly schedule: time, stop dot, what happens, and where.
 */
export interface TimeRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 24-hour, en-dash ranges: '10:15–11:40'. */
  time?: string;
  title?: string;
  /** Middot-separated metadata: 'Platform 3 · 12 min walk'. */
  meta?: string;
  /** Stop state, matching the trail vocabulary. */
  state?: 'decided' | 'open' | 'waiting' | 'destination';
  /** Set on the deep-leaf day plan. */
  onDark?: boolean;
  trailing?: React.ReactNode;
}

export declare function TimeRow(props: TimeRowProps): React.JSX.Element;
