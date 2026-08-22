// Provider-agnostic shapes. TripMap.tsx and Library.tsx only ever import
// these plus <MapView> and <PlaceSearch> — never `leaflet` or `react-leaflet`
// directly. That is the seam: swapping the renderer for a keyed provider
// (Google/Mapbox) later means rewriting the inside of this folder only.

/** Mirrors the trail vocabulary from architecture.md §5 and screens.md. */
export type PinState = 'scheduled' | 'potential' | 'destination';

/**
 * How a pin relates to what the screen around it is currently saying —
 * "already in a bundle", "in the list you can see", "out of view". It is
 * deliberately NOT derived here: only the board holds both the viewport
 * bounds and the bundle membership, so the board computes tone and hands it
 * down. MapView draws what it is told; giving the map that knowledge would
 * put board vocabulary inside the provider seam and break the swap.
 */
export type PinTone = 'bundled' | 'inView' | 'offView';

/**
 * A stronger split than tone: 'chip' draws the labelled leaf pill (this idea
 * is in the list beside the map), 'dot' draws a small neutral circle (located,
 * but not in what you're reading), 'faint' draws a barely-there dot (filtered
 * out of the current reading, but never removed from the map — a filter that
 * deleted pins would make the map lie about what the trip holds). Like `tone`,
 * it is board vocabulary the board computes and hands down — the map only
 * draws it. When set it wins over tone/variant for that pin; absent means the
 * variant/tone rendering decides.
 */
export type PinMark = 'chip' | 'dot' | 'faint';

export interface MapPin {
  id: number;
  lat: number;
  lng: number;
  title: string;
  state: PinState;
  /** Optional. Absent means "no opinion" — the pin draws in its neutral resting tone. */
  tone?: PinTone;
  /** Optional. Absent means the map's `pinVariant` (and `tone`) decide — see PinMark. */
  mark?: PinMark;
  /**
   * Optional. True means this place lives inside another kept thing (board
   * vocabulary again — the board knows the nesting, the map only draws it):
   * a chip-marked pin with `nested` draws its edge dashed, the same
   * "contained, not standalone" grammar the trail's dashed strokes use.
   * Absent means false; non-chip marks ignore it.
   */
  nested?: boolean;
}

/** A plain lat/lng box — the provider-agnostic stand-in for LatLngBounds. */
export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ClusterPoint {
  id: number;
  lat: number;
  lng: number;
}

/** A group of pins close enough together, at the current zoom, to draw as one mark. */
export interface Cluster<T extends ClusterPoint = ClusterPoint> {
  lat: number;
  lng: number;
  points: T[];
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
  /**
   * What the place is, in the provider's own vocabulary ('attraction',
   * 'restaurant', …). Optional and deliberately untyped beyond string: it is
   * a display hint, never something to branch on — an enum here would freeze
   * one provider's taxonomy into the seam.
   */
  kind?: string;
  /**
   * The provider's stable id for the place, when it has one. A string even
   * where the current provider counts in numbers, so the shape never encodes
   * which provider sits behind the seam.
   */
  placeId?: string;
}
