/** The 4px spacing scale from design/tokens/spacing.css, for layout primitives. */
export type SpaceToken = 0 | 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16;

export function spaceVar(token: SpaceToken): string {
  return token === 0 ? '0px' : `var(--space-${token})`;
}
