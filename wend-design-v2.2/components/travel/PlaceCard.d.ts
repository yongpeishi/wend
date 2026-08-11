import * as React from 'react';

/**
 * An idea on the board: name, metadata, one plain note, and the keep toggle.
 */
export interface PlaceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  name?: string;
  /** Uppercase label metadata: 'morning · east'. */
  meta?: string;
  /** One plain sentence about the place. */
  note?: string;
  kept?: boolean;
  onToggle?: () => void;
}

export declare function PlaceCard(props: PlaceCardProps): React.JSX.Element;
