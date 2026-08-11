import * as React from 'react';

/**
 * The Michikusa mark: three stops on a dotted trail — decided, open, waiting.
 */
export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** primary sits on paper; reversed sits on deep leaf. */
  variant?: 'primary' | 'reversed';
  /** Mark height in px. At 28 or below the stroke thickens automatically. Never below 24. */
  size?: number;
  /** Hide for favicons, app icons and stamps. */
  showWordmark?: boolean;
}

export declare function Logo(props: LogoProps): React.JSX.Element;
