import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { spaceVar, type SpaceToken } from './spacing';

interface FlexProps extends HTMLAttributes<HTMLDivElement> {
  gap?: SpaceToken;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
}

const ALIGN: Record<NonNullable<FlexProps['align']>, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

const JUSTIFY: Record<NonNullable<FlexProps['justify']>, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

export interface StackProps extends FlexProps {}

/** Vertical flex layout on the 4px gap scale. The gap IS the divider (per spacing rules) — draw a border only when a group's own edge needs one. */
export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { gap = 3, align = 'stretch', justify, wrap = false, style, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spaceVar(gap),
        alignItems: ALIGN[align],
        justifyContent: justify ? JUSTIFY[justify] : undefined,
        flexWrap: wrap ? 'wrap' : undefined,
        ...style,
      }}
      {...rest}
    />
  );
});

export interface RowProps extends FlexProps {}

/** Horizontal flex layout on the 4px gap scale. */
export const Row = forwardRef<HTMLDivElement, RowProps>(function Row(
  { gap = 3, align = 'center', justify, wrap = false, style, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: spaceVar(gap),
        alignItems: ALIGN[align],
        justifyContent: justify ? JUSTIFY[justify] : undefined,
        flexWrap: wrap ? 'wrap' : undefined,
        ...style,
      }}
      {...rest}
    />
  );
});
