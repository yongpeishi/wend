import * as React from 'react';

/**
 * Actions. Labels are verbs of movement rather than nouns — "Keep both for now", not "Save".
 * @startingPoint section="Core" subtitle="Primary, secondary, quiet and on-dark actions" viewport="700x160"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary is the single forward action per screen. onDark for deep-leaf surfaces. */
  variant?: 'primary' | 'secondary' | 'quiet' | 'onDark';
  disabled?: boolean;
  /** Renders the apricot focus ring; normally supplied by :focus-visible. */
  focused?: boolean;
}

export declare function Button(props: ButtonProps): React.JSX.Element;
