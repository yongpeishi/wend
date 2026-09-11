import type { Entry } from '../../api/types';
import type { MapPin, PinState } from './types';

/**
 * Which trail colour a pin takes. Lodging reads as the trip's anchor (plum) —
 * screens.md's "destination/lodging anchor" — ahead of scheduled/potential,
 * since a home base stays the anchor whether or not it has a schedule_item.
 * Everything else is leaf (scheduled) or pale (potential).
 */
export function pinStateForEntry(entry: Entry): PinState {
  if (entry.category === 'lodging') return 'destination';
  return entry.scheduled ? 'scheduled' : 'potential';
}

/** Colour never carries meaning alone — this is the word the popover shows next to it. */
export function pinStateLabel(state: PinState): string {
  if (state === 'scheduled') return 'Scheduled';
  if (state === 'destination') return 'Lodging anchor';
  return 'Potential';
}

/** Entries without coordinates never reach the map — this is the one filter that isn't optional. */
export function entriesWithCoordinates(entries: Entry[]): Entry[] {
  return entries.filter((e): e is Entry & { lat: number; lng: number } => e.lat !== null && e.lng !== null);
}

/**
 * The one place an entry becomes a pin — which is why carrying `category`
 * through here is the single change that categorises every map in the app:
 * TripMap.tsx, TripBoard.tsx and Library.tsx all build their pins from this
 * function. It is copied, not recomputed: the category is the trip's own word
 * for the thing, and the map's job is to draw it, not to have an opinion.
 */
export function entryToPin(entry: Entry & { lat: number; lng: number }): MapPin {
  return {
    id: entry.id,
    lat: entry.lat,
    lng: entry.lng,
    title: entry.title,
    state: pinStateForEntry(entry),
    category: entry.category,
  };
}
