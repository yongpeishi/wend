import * as React from 'react';

/**
 * The one surface container. Elevation is tone, never shadow.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** card is a half-step lighter than the page; inverse is the deep-leaf outdoor surface. */
  tone?: 'card' | 'page' | 'inverse';
  /** 1.5px subtle border. Off by default — tone usually does the work. */
  bordered?: boolean;
  radius?: 'card' | 'media' | 'screen';
  /** Any CSS length; defaults to var(--space-4). */
  padding?: string;
}

export declare function Card(props: CardProps): React.JSX.Element;
