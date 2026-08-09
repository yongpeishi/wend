import { useCallback, useState } from 'react';

export interface Coords {
  lat: number;
  lng: number;
}

interface GeolocationState {
  coords: Coords | null;
  /** Set once the browser has denied, or has no geolocation support at all. */
  denied: boolean;
  loading: boolean;
}

/**
 * Thin wrapper around `navigator.geolocation`. Deliberately small: the
 * "what's around here" flow only ever needs a one-shot fix, and needs to
 * fail softly into a manual fallback rather than throw.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ coords: null, denied: false, loading: false });

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ coords: null, denied: true, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          coords: { lat: position.coords.latitude, lng: position.coords.longitude },
          denied: false,
          loading: false,
        });
      },
      () => {
        setState({ coords: null, denied: true, loading: false });
      },
      { timeout: 8000 },
    );
  }, []);

  return { ...state, request };
}
