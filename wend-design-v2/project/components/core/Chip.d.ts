import * as React from 'react';

/**
 * Filters and interests during the widening passes; also the saved-count tag.
 * @startingPoint section="Core" subtitle="Interest filters and saved tag" viewport="700x140"
 */
export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  selected?: boolean;
  /** 'saved' renders the plum tag used for kept places. */
  tone?: 'default' | 'saved';
}

export declare function Chip(props: ChipProps): React.JSX.Element;
