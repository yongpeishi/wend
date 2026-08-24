import { Chip } from 'frontend';

const row: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  alignItems: 'center',
};

/** Interest filters — additive selection, always tappable. */
export const Filters = () => (
  <div style={row}>
    <Chip selected>Temples</Chip>
    <Chip>Food</Chip>
    <Chip>Walks</Chip>
    <Chip>Markets</Chip>
  </div>
);

/** Selected and unselected side by side — the pair is what reads. */
export const States = () => (
  <div style={row}>
    <Chip selected>Selected</Chip>
    <Chip>Unselected</Chip>
  </div>
);

/** The plum tag tone, used for places already kept. */
export const SavedTone = () => (
  <div style={row}>
    <Chip tone="saved">Kept · 12</Chip>
    <Chip tone="saved">Kept · Kyoto</Chip>
  </div>
);
