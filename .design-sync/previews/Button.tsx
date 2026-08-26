import { Button } from 'frontend';

const row: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  alignItems: 'center',
};

const dark: React.CSSProperties = {
  ...row,
  background: 'var(--surface-inverse)',
  padding: 'var(--space-6)',
  borderRadius: 'var(--radius-card)',
};

/** The three everyday variants. Labels name the outcome, never the mood. */
export const Variants = () => (
  <div style={row}>
    <Button variant="primary">Save trip</Button>
    <Button variant="secondary">Add scenic route</Button>
    <Button variant="quiet">Skip</Button>
  </div>
);

/** The only control the error hue is allowed to fill. */
export const Destructive = () => (
  <div style={row}>
    <Button variant="destructive">Remove them</Button>
  </div>
);

/** medium covers nearly every case; small for dense rows, large for one hero CTA. */
export const Sizes = () => (
  <div style={row}>
    <Button size="small">Set aside</Button>
    <Button size="medium">Save trip</Button>
    <Button size="large">Start planning</Button>
  </div>
);

/** Fills with --surface-disabled and muted text — never struck through. */
export const Disabled = () => (
  <div style={row}>
    <Button variant="primary" disabled>Save trip</Button>
    <Button variant="secondary" disabled>Add scenic route</Button>
    <Button variant="destructive" disabled>Remove them</Button>
  </div>
);

/** For deep-leaf surfaces, where the primary green would disappear. */
export const OnDark = () => (
  <div style={dark}>
    <Button variant="onDark">Save trip</Button>
  </div>
);
