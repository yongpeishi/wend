import * as React from 'react';

/**
 * Actions. A button label names its outcome in plain words — "Save trip", "Add scenic route".
 * Warmth belongs in the copy around the button, not in guessing what it does.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary is the single forward action per screen. onDark for deep-leaf surfaces. */
  /** destructive is the only control filled with the error hue — deletes, and nothing else. */
  variant?: 'primary' | 'secondary' | 'quiet' | 'destructive' | 'onDark';
  /** medium is the default for standalone screen actions. small is for actions embedded inside a dense row (a list item, a compact input) where a medium button would overwhelm the row — never the only way to reach a primary action. large is for a single hero CTA. */
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  /** Renders the apricot focus ring; normally supplied by :focus-visible. */
  focused?: boolean;
}

export declare function Button(props: ButtonProps): React.JSX.Element;
