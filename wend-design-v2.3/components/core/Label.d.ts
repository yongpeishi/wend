import * as React from 'react';

/**
 * The uppercase tracked label — the only place in Wend that is not sentence case.
 */
export interface LabelProps extends React.HTMLAttributes<HTMLElement> {
  tone?: 'muted' | 'strong' | 'onDark' | 'saved';
  /** Element to render. Default 'span'. */
  as?: keyof React.JSX.IntrinsicElements;
}

export declare function Label(props: LabelProps): React.JSX.Element;
