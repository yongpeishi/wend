import type { Entry } from '../../api/types';
import type { MapPin, PinState } from './types';

/**
 * Which trail colour a pin takes. Lodging reads as the trip's anchor (bister) —
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

export function entryToPin(entry: Entry & { lat: number; lng: number }): MapPin {
  return { id: entry.id, lat: entry.lat, lng: entry.lng, title: entry.title, state: pinStateForEntry(entry) };
}
