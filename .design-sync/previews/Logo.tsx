import { Logo } from 'frontend';

const row: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-6)',
  alignItems: 'center',
};

const dark: React.CSSProperties = {
  ...row,
  background: 'var(--surface-inverse)',
  padding: 'var(--space-6)',
  borderRadius: 'var(--radius-card)',
};

/** The mark and WEND wordmark lock-up, on paper. */
export const Primary = () => (
  <div style={row}>
    <Logo variant="primary" size={40} />
  </div>
);

/** Reversed, for deep-leaf surfaces. */
export const Reversed = () => (
  <div style={dark}>
    <Logo variant="reversed" size={40} />
  </div>
);

/** Mark only — favicons, app icons, stamps. At 28 and below the stroke thickens. */
export const MarkOnly = () => (
  <div style={row}>
    <Logo size={40} showWordmark={false} />
    <Logo size={28} showWordmark={false} />
    <Logo size={24} showWordmark={false} />
  </div>
);

/** The lock-up holds its proportions across the size range. */
export const Sizes = () => (
  <div style={row}>
    <Logo size={56} />
    <Logo size={40} />
    <Logo size={28} />
  </div>
);
