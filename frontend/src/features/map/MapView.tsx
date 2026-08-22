import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { boundsTupleForPoints } from './bounds';
import { cellSizeForZoom, clusterPoints, isMultiPointCluster } from './clustering';
import { fitAndReport, readBounds } from './fit';
import { chipIcon, clusterIcon, dotIcon, faintIcon, labelIcon, pendingIcon, pinIcon } from './markerIcon';
import type { Bounds, Cluster, ClusterPoint, MapPin } from './types';
import styles from './MapView.module.css';

const WORLD_CENTER: [number, number] = [20, 0];
const WORLD_ZOOM = 2;
/** Not an entry id, and cannot be mistaken for one: only the fit ever sees it. */
const YOU_ARE_HERE_ID = -1;

/** How a pin draws. 'marker' is the trail stop-circle; 'label' is a name pill. */
export type PinVariant = 'marker' | 'label';

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
  /**
   * Where the reader is standing. The same apricot ring as `pendingLocation` —
   * both mean "a point that is not a kept place" — but a separate prop, because
   * it is a separate fact and it is counted in `fitToPins`: a map showing only
   * you should open on your street, not on the whole world with the ring
   * somewhere off the edge.
   */
  youAreHere?: { lat: number; lng: number } | null;
  /** Fit the view to `pins` the first time a non-empty set arrives — "bounds fit to the trip's entries on load". */
  fitToPins?: boolean;
  /**
   * Bump to any new number to re-fit the view to every current pin. A number
   * rather than a callback because "widen the view" is a thing that happened,
   * not a thing that is true — and the caller owns *when*, while this file
   * keeps knowing *how*, so nothing outside the seam ever holds a map handle.
   */
  fitRequest?: number;
  /**
   * Point the view at a specific subset of places — "show me these" — without
   * the caller ever holding a map handle. Same shape of ask as `fitRequest`
   * (a nonce, because "look here" is a thing that happened, not a thing that
   * is true), but it carries its own points: the board asks for one bundle's
   * places, or one place, while `fitRequest` always means everything. Two or
   * more points fit their bounds; exactly one centres on it at street zoom,
   * since a one-point "bounds" is a zero-area box Leaflet would dive into.
   */
  viewRequest?: { points: { id: number; lat: number; lng: number }[]; nonce: number } | null;
  /** How pins draw. Defaults to the trail stop-circle; the board asks for name pills instead. */
  pinVariant?: PinVariant;
  onBoundsChange?: (bounds: Bounds) => void;
  /** Popover content for a pin, e.g. the compact EntryRow. Keeps entry-shaped data out of this file entirely. */
  renderPopup?: (id: number) => ReactNode;
  height?: number | string;
  'aria-label'?: string;
}

function FitToPins({
  pins,
  enabled,
  onBoundsChange,
}: {
  pins: ClusterPoint[];
  enabled: boolean;
  onBoundsChange?: (bounds: Bounds) => void;
}) {
  const map = useMap();
  const fitted = useRef(false);

  const idsKey = pins
    .map((p) => p.id)
    .sort((a, b) => a - b)
    .join(',');

  useEffect(() => {
    if (!enabled || fitted.current || pins.length === 0) return;
    // Through the fit-and-report seam, not a bare fitBounds: on a cold mount
    // this effect beats both the ResizeObserver's invalidateSize and
    // ViewportBridge's event listeners, so a silent fit here would leave the
    // parent holding bounds nothing ever corrects — see fit.ts.
    fitAndReport(map, pins, onBoundsChange);
    fitted.current = true;
    // idsKey is the real dependency (identity-stable across re-renders of the same set);
    // map/enabled are stable too, and onBoundsChange is a state setter at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, enabled]);

  return null;
}

/**
 * "Widen" — return the view to everything, on demand, any number of times.
 * Separate from FitToPins because the two answer different questions: that one
 * is "we have never looked at this trip", this one is "the reader asked to see
 * it all again", and folding them together would mean a one-shot ref that has
 * to be un-set, which is exactly the kind of state that breaks under
 * StrictMode's double-invoked effects.
 *
 * The guard is a comparison, not a flag: the ref starts at whatever the first
 * `fitRequest` was, so the mounting value never counts as a request, and a
 * re-run of this effect (StrictMode, or a new `pins` array) sees no change and
 * does nothing. Only an actually different number moves the map.
 */
function RefitOnRequest({
  pins,
  fitRequest,
  onBoundsChange,
}: {
  pins: ClusterPoint[];
  fitRequest: number | undefined;
  onBoundsChange?: (bounds: Bounds) => void;
}) {
  const map = useMap();
  const handled = useRef(fitRequest);

  useEffect(() => {
    if (fitRequest === handled.current) return;
    handled.current = fitRequest;
    // The seam, so "Widen" always leaves correct bounds behind — even when the
    // fit resolves to the view the map is already on and no moveend fires.
    // That silent case is exactly how a Widen used to look broken: pressed
    // against stale bounds, it moved nothing and corrected nothing.
    fitAndReport(map, pins, onBoundsChange);
  }, [fitRequest, pins, map, onBoundsChange]);

  return null;
}

/** The zoom a single-place "show me this" lands on — streets and the blocks around them, not a rooftop. */
const PLACE_ZOOM = 16;

/**
 * "Show me these" — move the view to a caller-chosen subset of points.
 * Same guard idiom as RefitOnRequest, and for the same reasons: the ref
 * starts at whatever nonce the component mounted with, so the mounting value
 * never counts as a request, and StrictMode's double-invoked effects see no
 * change on the re-run. Only an actually different nonce moves the map.
 *
 * Both branches report through onBoundsChange, exactly as every other
 * programmatic movement does (see fit.ts): the multi-point branch through the
 * fit-and-report seam, the single-point branch by reading the bounds straight
 * after `setView` — which moveend cannot be trusted to do, because a view the
 * map is already on fires nothing, and the parent would keep counting pins
 * against a viewport nobody is looking at.
 */
function ViewOnRequest({
  viewRequest,
  onBoundsChange,
}: {
  viewRequest: MapViewProps['viewRequest'];
  onBoundsChange?: (bounds: Bounds) => void;
}) {
  const map = useMap();
  const handled = useRef(viewRequest?.nonce);

  useEffect(() => {
    if (!viewRequest || viewRequest.nonce === handled.current) return;
    handled.current = viewRequest.nonce;
    const { points } = viewRequest;
    if (points.length >= 2) {
      fitAndReport(map, points, onBoundsChange);
    } else if (points.length === 1) {
      const only = points[0]!;
      map.setView([only.lat, only.lng], PLACE_ZOOM);
      onBoundsChange?.(readBounds(map));
    }
  }, [viewRequest, map, onBoundsChange]);

  return null;
}

/**
 * Leaflet caches its container size and paints grey where it thinks there is
 * no map, so any layout change it wasn't told about leaves a half-drawn tile
 * grid. The board's split grid re-lays out whenever the map appears beside the
 * list, and no React prop describes that — the size change happens in CSS. A
 * ResizeObserver is the only thing that actually sees it.
 *
 * Deferred a frame because the observer fires mid-layout, and doing work
 * synchronously there is what produces "ResizeObserver loop completed with
 * undelivered notifications". Guarded because jsdom has no ResizeObserver.
 */
function ResizeBridge() {
  const map = useMap();

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize());
    });
    observer.observe(map.getContainer());
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);

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
    // invalidateSize announces itself here, not through moveend: when the
    // container goes from unmeasured to its real size the view need not move
    // at all, and without this the parent would keep the bounds of a map
    // Leaflet thought was a different shape.
    resize() {
      reportBounds();
    },
  });

  function reportBounds() {
    onBoundsChange?.(readBounds(map));
  }

  useEffect(() => {
    // Behind whenReady rather than read immediately: the starting viewport is
    // only worth reporting once Leaflet considers the view set. It is still
    // just the starting value — the fit and the resize that follow on a cold
    // mount each re-report through their own paths above and in fit.ts.
    map.whenReady(() => {
      onZoomChange(map.getZoom());
      reportBounds();
    });
    // Report the starting viewport once on mount; every change after that comes through the map events above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function PinMarker({
  pin,
  selected,
  variant,
  onSelectPin,
  renderPopup,
}: {
  pin: MapPin;
  selected: boolean;
  variant: PinVariant;
  onSelectPin?: (id: number) => void;
  renderPopup?: (id: number) => ReactNode;
}) {
  // A per-pin mark beats the per-map variant: the board sets `mark` exactly
  // when it wants the chip/dot split, and pins without one keep drawing the
  // way the variant says — so a caller that never sets it sees no change.
  const icon = useMemo(() => {
    if (pin.mark === 'chip') return chipIcon(pin.title, selected, pin.nested);
    if (pin.mark === 'dot') return dotIcon(pin.title, selected);
    if (pin.mark === 'faint') return faintIcon(pin.title);
    return variant === 'label' ? labelIcon(pin.title, pin.tone, selected) : pinIcon(pin.state, selected, pin.title);
  }, [variant, pin.mark, pin.state, pin.tone, pin.nested, selected, pin.title]);
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
          const bounds = boundsTupleForPoints(cluster.points);
          if (bounds) map.fitBounds(bounds, { padding: [48, 48] });
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
 * Pins draw one of two ways. `pinVariant='marker'` is the trail stop-circle,
 * for a map that is mostly map. `pinVariant='label'` is a name pill, for the
 * board, where the map sits beside the list it filters and the reader is
 * matching places to names rather than reading geography. Which tone a pill
 * takes is the caller's call (see MapPin.tone) — this file never decides it,
 * because "in the current view" and "already bundled" are board facts, and
 * teaching the map about them would nail it to this one screen.
 *
 * Not covered by an automated render test: jsdom has no real layout engine,
 * so a mounted <MapContainer> can't be asserted against meaningfully here.
 * The logic it depends on (clustering, bounds, pin state) is unit-tested in
 * this same folder — including the fit-and-report seam in fit.ts, which is
 * exercised against a stub map because the cold-mount defect it closes
 * (bounds seeded from an unsized container, then never corrected because the
 * fit fired no moveend) is exactly the kind jsdom cannot reproduce. Route
 * tests mock this component and exercise the wiring (selection, filtering,
 * the "take these somewhere" flow) through its props.
 */
export function MapView({
  pins,
  selectedId = null,
  onSelectPin,
  onSelectCluster,
  onMapClick,
  pendingLocation = null,
  youAreHere = null,
  fitToPins = false,
  fitRequest,
  viewRequest = null,
  pinVariant = 'marker',
  onBoundsChange,
  renderPopup,
  height = '100%',
  'aria-label': ariaLabel = 'Map',
}: MapViewProps) {
  const [zoom, setZoom] = useState(WORLD_ZOOM);
  const clusters = useMemo(() => clusterPoints(pins, cellSizeForZoom(zoom)), [pins, zoom]);

  // What the view fits to, which is not the same set as what clusters: "you"
  // are a point on the map but never a pin, so you are counted here and only
  // here. The id is negative so it can never collide with an entry's.
  const fitPoints = useMemo(
    () => (youAreHere ? [...pins, { id: YOU_ARE_HERE_ID, lat: youAreHere.lat, lng: youAreHere.lng }] : pins),
    [pins, youAreHere],
  );

  return (
    <div className={styles.wrap} style={{ height }} role="group" aria-label={ariaLabel}>
      <MapContainer center={WORLD_CENTER} zoom={WORLD_ZOOM} scrollWheelZoom zoomControl={false} className={styles.map}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {/* Leaflet's own control, moved and restyled — not rebuilt. It already
            handles keyboard focus and disables itself at min/max zoom; a
            hand-rolled pair of buttons would have to re-earn both. */}
        <ZoomControl position="topright" />
        <FitToPins pins={fitPoints} enabled={fitToPins} onBoundsChange={onBoundsChange} />
        <RefitOnRequest pins={fitPoints} fitRequest={fitRequest} onBoundsChange={onBoundsChange} />
        <ViewOnRequest viewRequest={viewRequest} onBoundsChange={onBoundsChange} />
        <ResizeBridge />
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
              variant={pinVariant}
              onSelectPin={onSelectPin}
              renderPopup={renderPopup}
            />
          ),
        )}

        {pendingLocation && (
          <Marker position={[pendingLocation.lat, pendingLocation.lng]} icon={pendingIcon()} interactive={false} />
        )}

        {youAreHere && <Marker position={[youAreHere.lat, youAreHere.lng]} icon={pendingIcon()} interactive={false} />}
      </MapContainer>
    </div>
  );
}
