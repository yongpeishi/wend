import { Select } from 'frontend';

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

/** Categorising an idea on the board. The closed control is ours, the open menu the OS's. */
export const Category = () => (
  <div style={stack}>
    <span style={label}>Category</span>
    <Select defaultValue="food">
      <option value="">Not sure yet</option>
      <option value="place">Place</option>
      <option value="food">Food</option>
      <option value="activity">Activity</option>
      <option value="lodging">Lodging</option>
      <option value="transport">Transport</option>
      <option value="other">Other</option>
    </Select>
  </div>
);

/** Choosing what a collaborator can do. */
export const Role = () => (
  <div style={stack}>
    <span style={label}>What Peter can do</span>
    <Select defaultValue="member">
      <option value="member">Can edit</option>
      <option value="viewer">Can view</option>
    </Select>
  </div>
);

/** Same rust border as Input, for the same reason and under the same rule. */
export const ErrorState = () => (
  <div style={stack}>
    <span style={label}>Category</span>
    <Select error defaultValue="">
      <option value="">Not sure yet</option>
      <option value="place">Place</option>
      <option value="food">Food</option>
    </Select>
  </div>
);

/** Disabled while a change is in flight. */
export const Disabled = () => (
  <div style={stack}>
    <Select disabled defaultValue="member">
      <option value="member">Can edit</option>
      <option value="viewer">Can view</option>
    </Select>
  </div>
);
