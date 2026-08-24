import { Trail } from 'frontend';

const block: React.CSSProperties = {
  maxWidth: 460,
};

const dark: React.CSSProperties = {
  ...block,
  background: 'var(--surface-inverse)',
  padding: 'var(--space-6)',
  borderRadius: 'var(--radius-card)',
};

/** The three passes of a trip. Exactly one stop is 'open' — that is where you are. */
export const ThreePasses = () => (
  <div style={block}>
    <Trail stops={['decided', 'open', 'waiting']} labels={['Brainstorm', 'Gather', 'Schedule']} />
  </div>
);

/** The same trail on a deep-leaf surface. */
export const OnDark = () => (
  <div style={dark}>
    <Trail onDark stops={['decided', 'open', 'waiting']} labels={['Brainstorm', 'Gather', 'Schedule']} />
  </div>
);

/** A longer path ending in a plum destination stop. */
export const WithDestination = () => (
  <div style={block}>
    <Trail stops={['decided', 'decided', 'open', 'waiting', 'destination']} />
  </div>
);

/** All four stop states, in narrative order. */
export const StopStates = () => (
  <div style={block}>
    <Trail
      stops={['decided', 'open', 'waiting', 'destination']}
      labels={['Decided', 'Open', 'Waiting', 'Destination']}
    />
  </div>
);
