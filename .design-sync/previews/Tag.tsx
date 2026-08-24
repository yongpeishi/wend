import { Tag } from 'frontend';

const row: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  alignItems: 'center',
};

/** A static label — same visual language as Chip, but it triggers nothing. */
export const Default = () => (
  <div style={row}>
    <Tag>Morning</Tag>
    <Tag>East</Tag>
    <Tag>2 hours</Tag>
  </div>
);

/** The plum tone that marks kept places. */
export const Saved = () => (
  <div style={row}>
    <Tag tone="saved">Saved · 12</Tag>
    <Tag tone="saved">Saved · Fushimi Inari</Tag>
  </div>
);
