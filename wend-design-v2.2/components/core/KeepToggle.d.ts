import * as React from 'react';

/**
 * The circular keep control. Kept fills plum; unkept is an open ring — nothing is ever struck through.
 */
export interface KeepToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  kept?: boolean;
  /** Full hit area in px. 48 on touch; never below 32. */
  size?: number;
  /** Accessible verb, e.g. 'Keep Nanzen-ji'. */
  label?: string;
  onToggle?: () => void;
}

export declare function KeepToggle(props: KeepToggleProps): React.JSX.Element;
