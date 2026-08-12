import * as React from 'react';

/**
 * Actions. Labels are verbs of movement rather than nouns — "Keep both for now", not "Save".
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary is the single forward action per screen. onDark for deep-leaf surfaces. */
  variant?: 'primary' | 'secondary' | 'quiet' | 'onDark';
  /** medium is the default for standalone screen actions. small is for actions embedded inside a dense row (a list item, a compact input) where a medium button would overwhelm the row — never the only way to reach a primary action. large is for a single hero CTA. */
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  /** Renders the apricot focus ring; normally supplied by :focus-visible. */
  focused?: boolean;
}

export declare function Button(props: ButtonProps): React.JSX.Element;
