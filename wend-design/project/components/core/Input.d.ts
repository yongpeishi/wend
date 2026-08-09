import * as React from 'react';

/**
 * Single-line text entry — destinations, dates, notes.
 * @startingPoint section="Core" subtitle="Rest and focused text entry" viewport="700x160"
 */
export interface InputProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  placeholder?: string;
  /** Apricot border plus a soft wash — the focus treatment used system-wide. */
  focused?: boolean;
  /** Trailing affordance, e.g. the return glyph. */
  hint?: string;
}

export declare function Input(props: InputProps): React.JSX.Element;
