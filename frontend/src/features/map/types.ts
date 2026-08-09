// Provider-agnostic shapes. TripMap.tsx and Library.tsx only ever import
// these plus <MapView> and <PlaceSearch> — never `leaflet` or `react-leaflet`
// directly. That is the seam: swapping the renderer for a keyed provider
// (Google/Mapbox) later means rewriting the inside of this folder only.

/** Mirrors the trail vocabulary from architecture.md §5 and screens.md. */
export type PinState = 'scheduled' | 'potential' | 'destination';

export interface MapPin {
  id: number;
  lat: number;
  lng: number;
  title: string;
  state: PinState;
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
}
