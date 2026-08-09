import { PlaceholderScreen } from './PlaceholderScreen';

/** /library — Collection mode: all unassigned ideas, map, select -> new trip. */
export function Library() {
  return (
    <PlaceholderScreen
      title="Library"
      description="Ideas saved without a trip yet — inspiration waiting to be used."
      message="Nothing kept yet. Saving something is how a trip starts."
    />
  );
}
