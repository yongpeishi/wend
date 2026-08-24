import { Input } from 'frontend';

const stack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  maxWidth: 420,
};

const label: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-label-size)',
  letterSpacing: 'var(--text-label-tracking)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const errorText: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-small-size)',
  color: 'var(--text-error)',
};

/** Empty, with a plain-question placeholder. A placeholder is never the only label. */
export const Placeholder = () => (
  <div style={stack}>
    <Input placeholder="Where are you going?" />
  </div>
);

/** Filled, with the trailing return glyph. */
export const WithHint = () => (
  <div style={stack}>
    <Input defaultValue="Kyoto" hint="↵" />
    <Input placeholder="Add a note" hint="↵" />
  </div>
);

/** The rust border says "something here"; the message says what. */
export const ErrorState = () => (
  <div style={stack}>
    <span style={label}>Arrival date</span>
    <Input error defaultValue="2019-04-02" />
    <span style={errorText}>Enter a date in 2026 or later.</span>
  </div>
);

/** A labelled field the way the product composes one. */
export const Labelled = () => (
  <div style={stack}>
    <span style={label}>Destination</span>
    <Input placeholder="Where are you going?" hint="↵" />
  </div>
);
