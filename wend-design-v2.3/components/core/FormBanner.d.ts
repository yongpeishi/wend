import * as React from 'react';

/**
 * Form-level summary shown above the fields after a submit attempt. Errors list what
 * needs attention; success confirms what happened. Rust or jade border with a wash —
 * the only place a wash background is used in the system.
 */
export interface FormBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'error' | 'success';
  /** One short line: "Two things need a look", "Trip saved." */
  title?: string;
  /** Each item names a field and its fix. Keep to the fields that actually failed. */
  items?: string[];
  /** Free text used instead of, or after, `items`. */
  children?: React.ReactNode;
}

export declare function FormBanner(props: FormBannerProps): React.JSX.Element;
