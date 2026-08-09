import * as React from 'react';

/**
 * The only navigation metaphor in Wend: a dotted path whose stops record the three passes.
 * @startingPoint section="Brand" subtitle="Three-pass progress trail" viewport="700x160"
 */
export interface TrailProps extends React.HTMLAttributes<HTMLDivElement> {
  /** One entry per pass, in order. Exactly one stop should be 'open'. */
  stops?: Array<'decided' | 'open' | 'waiting' | 'destination'>;
  /** Optional caption per stop, e.g. ['Explore', 'Shortlist', 'Day plan']. */
  labels?: string[];
  /** Set on deep-leaf surfaces. */
  onDark?: boolean;
  /** SVG height in px. Default 46. */
  height?: number;
}

export declare function Trail(props: TrailProps): React.JSX.Element;
