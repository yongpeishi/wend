import { PlaceholderScreen } from './PlaceholderScreen';

/** /  — Trips list + library summary. Desktop-first (architecture.md §6). */
export function TripsList() {
  return (
    <PlaceholderScreen
      title="Your trips"
      description="Every trip you're planning, and a summary of what's waiting in your library."
      message="Nothing kept yet. Saving something is how a trip starts."
    />
  );
}
