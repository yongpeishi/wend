import * as React from 'react';

/**
 * Diagonal hatch standing in for photography. Wend never uses a grey box.
 */
export interface PlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  height?: number | string;
  radius?: 'media' | 'card' | 'none';
  /** Optional mono caption naming what belongs here. */
  caption?: string;
}

export declare function Placeholder(props: PlaceholderProps): React.JSX.Element;
