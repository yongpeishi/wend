import { Switch } from 'frontend';

const stack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  alignItems: 'flex-start',
};

const noop = () => {};

/** Off and on together — the knob's position is the primary signal, so it only reads as a pair. */
export const States = () => (
  <div style={stack}>
    <Switch checked={false} onCheckedChange={noop}>Follow the map</Switch>
    <Switch checked onCheckedChange={noop}>Follow the map</Switch>
  </div>
);

/** A settings group. The words beside the track are the control's accessible name. */
export const SettingsGroup = () => (
  <div style={stack}>
    <Switch checked onCheckedChange={noop}>Follow the map</Switch>
    <Switch checked={false} onCheckedChange={noop}>Show set-aside ideas</Switch>
    <Switch checked onCheckedChange={noop}>Group by day</Switch>
  </div>
);

/** Disabled — the track goes neutral in both states; the knob's position still says on/off. */
export const Disabled = () => (
  <div style={stack}>
    <Switch checked disabled onCheckedChange={noop}>Follow the map</Switch>
    <Switch checked={false} disabled onCheckedChange={noop}>Show set-aside ideas</Switch>
  </div>
);
