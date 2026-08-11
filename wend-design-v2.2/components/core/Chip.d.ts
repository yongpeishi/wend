import * as React from 'react';

/**
 * Filters and interests during the widening passes. Always interactive.
 */
export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  selected?: boolean;
}

export declare function Chip(props: ChipProps): React.JSX.Element;
