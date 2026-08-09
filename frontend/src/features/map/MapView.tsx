import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { boundsForPoints } from './bounds';
import { cellSizeForZoom, clusterPoints, isMultiPointCluster } from './clustering';
import { clusterIcon, pendingIcon, pinIcon } from './markerIcon';
import type { Bounds, Cluster, MapPin } from './types';
import styles from './MapView.module.css';

const WORLD_CENTER: [number, number] = [20, 0];
const WORLD_ZOOM = 2;

export interface MapViewProps {
  pins: MapPin[];
  selectedId?: number | null;
  onSelectPin?: (id: number) => void;
  /** Fired with every entry id inside a cluster the user opened — the map already zooms to it on its own. */
  onSelectCluster?: (ids: number[]) => void;
  /** Manual pin-drop: fires with the clicked lat/lng on any click that isn't on a pin or cluster. */
  onMapClick?: (lat: number, lng: number) => void;
  /** The not-yet-saved location while capturing a new idea — drawn as an apricot dashed ring. */
  pendingLocation?: { lat: number; lng: number } | null;
  /** Fit the view to `pins` the first time a non-empty set arrives — "bounds fit to the trip's entries on load". */
  fitToPins?: boolean;
  onBoundsChange?: (bounds: Bounds) => void;
  /** Popover content for a pin, e.g. the compact EntryRow. Keeps entry-shaped data out of this file entirely. */
  renderPopup?: (id: number) => ReactNode;
  height?: number | string;
  'aria-label'?: string;
}

function FitToPins({ pins, enabled }: { pins: MapPin[]; enabled: boolean }) {
  const map = useMap();
  const fitted = useRef(false);
  const idsKey = pins
    .map((p) => p.id)
    .sort((a, b) => a - b)
    .join(',');

  useEffect(() => {
    if (!enabled || fitted.current || pins.length === 0) return;
    const bounds = boundsForPoints(pins);
    if (!bounds) return;
    map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [32, 32] },
    );
    fitted.current = true;
    // idsKey is the real dependency (identity-stable across re-renders of the same set); map/enabled are stable too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, enabled]);

  return null;
}

function ViewportBridge({
  onMapClick,
  onBoundsChange,
  onZoomChange,
}: {
  onMapClick?: (lat: number, lng: number) => void;
  onBoundsChange?: (bounds: Bounds) => void;
  onZoomChange: (zoom: number) => void;
}) {
  const map = useMapEvents({
    click(event) {
      onMapClick?.(event.latlng.lat, event.latlng.lng);
    },
    moveend() {
      reportBounds();
    },
    zoomend() {
      onZoomChange(map.getZoom());
      reportBounds();
    },
  });

  function reportBounds() {
    const b = map.getBounds();
    onBoundsChange?.({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
  }

  useEffect(() => {
    onZoomChange(map.getZoom());
    reportBounds();
    // Report the starting viewport once on mount; every change after that comes through the map events above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function PinMarker({
  pin,
  selected,
  onSelectPin,
  renderPopup,
}: {
  pin: MapPin;
  selected: boolean;
  onSelectPin?: (id: number) => void;
  renderPopup?: (id: number) => ReactNode;
}) {
  const icon = useMemo(() => pinIcon(pin.state, selected, pin.title), [pin.state, selected, pin.title]);
  return (
    <Marker
      position={[pin.lat, pin.lng]}
      icon={icon}
      eventHandlers={{
        click: (event) => {
          L.DomEvent.stopPropagation(event);
          onSelectPin?.(pin.id);
        },
      }}
    >
      {renderPopup && (
        <Popup className={styles.popup} closeButton>
          {renderPopup(pin.id)}
        </Popup>
      )}
    </Marker>
  );
}

function ClusterMarker({ cluster, onSelectCluster }: { cluster: Cluster<MapPin>; onSelectCluster?: (ids: number[]) => void }) {
  const map = useMap();
  const icon = useMemo(() => clusterIcon(cluster.points.length), [cluster.points.length]);
  return (
    <Marker
      position={[cluster.lat, cluster.lng]}
      icon={icon}
      eventHandlers={{
        click: (event) => {
          L.DomEvent.stopPropagation(event);
          const bounds = boundsForPoints(cluster.points);
          if (bounds) {
            map.fitBounds(
              [
                [bounds.south, bounds.west],
                [bounds.north, bounds.east],
              ],
              { padding: [48, 48] },
            );
          }
          onSelectCluster?.(cluster.points.map((p) => p.id));
        },
      }}
    />
  );
}

/**
 * The one seam that knows `leaflet` exists. TripMap.tsx and Library.tsx talk
 * to this component only through the provider-agnostic types in ./types —
 * swapping in a keyed provider later means rewriting this file (and
 * markerIcon.ts / geocode.ts), not the routes that use it.
 *
 * Not covered by an automated render test: jsdom has no real layout engine,
 * so a mounted <MapContainer> can't be asserted against meaningfully here.
 * The logic it depends on (clustering, bounds, pin state) is unit-tested in
 * this same folder; route tests mock this component and exercise the wiring
 * (selection, filtering, the "take these somewhere" flow) through its props.
 */
export function MapView({
  pins,
  selectedId = null,
  onSelectPin,
  onSelectCluster,
  onMapClick,
  pendingLocation = null,
  fitToPins = false,
  onBoundsChange,
  renderPopup,
  height = '100%',
  'aria-label': ariaLabel = 'Map',
}: MapViewProps) {
  const [zoom, setZoom] = useState(WORLD_ZOOM);
  const clusters = useMemo(() => clusterPoints(pins, cellSizeForZoom(zoom)), [pins, zoom]);

  return (
    <div className={styles.wrap} style={{ height }} role="group" aria-label={ariaLabel}>
      <MapContainer center={WORLD_CENTER} zoom={WORLD_ZOOM} scrollWheelZoom className={styles.map}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitToPins pins={pins} enabled={fitToPins} />
        <ViewportBridge onMapClick={onMapClick} onBoundsChange={onBoundsChange} onZoomChange={setZoom} />

        {clusters.map((cluster) =>
          isMultiPointCluster(cluster) ? (
            <ClusterMarker
              key={`cluster-${cluster.points
                .map((p) => p.id)
                .sort((a, b) => a - b)
                .join('-')}`}
              cluster={cluster}
              onSelectCluster={onSelectCluster}
            />
          ) : (
            <PinMarker
              key={cluster.points[0]!.id}
              pin={cluster.points[0]!}
              selected={cluster.points[0]!.id === selectedId}
              onSelectPin={onSelectPin}
              renderPopup={renderPopup}
            />
          ),
        )}

        {pendingLocation && (
          <Marker position={[pendingLocation.lat, pendingLocation.lng]} icon={pendingIcon()} interactive={false} />
        )}
      </MapContainer>
    </div>
  );
}
