import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NearbyPanel } from './NearbyPanel';
import type { NearbyPlace } from './NearbyPanel';
import type { MapViewProps } from '../map/MapView';

/**
 * jsdom has no layout engine, so a real Leaflet map cannot be mounted here (see
 * MapView.tsx's own doc comment) — the seam is mocked to a stub that reports the
 * props this panel wires up. What is under test is whether the map block is
 * drawn at all, and with which pins: the drawing itself is Leaflet's, and the
 * clustering and bounds maths it leans on are unit-tested in src/features/map/.
 */
vi.mock('../map/MapView', () => ({
  MapView: (props: MapViewProps) => (
    <div data-testid="map-view">
      <p data-testid="map-height">height: {String(props.height)}</p>
      <p data-testid="map-fit">fit: {String(props.fitToPins)}</p>
      <p data-testid="map-origin">
        origin: {props.pendingLocation ? `${props.pendingLocation.lat},${props.pendingLocation.lng}` : 'none'}
      </p>
      <ul>
        {props.pins.map((pin) => (
          <li key={pin.id}>
            {pin.title} ({pin.state})
          </li>
        ))}
      </ul>
    </div>
  ),
}));

const PLACES: NearbyPlace[] = [
  { id: 1, name: 'Nanzen-ji', meta: 'sight · 12 min walk', lat: 35.01, lng: 135.79 },
  { id: 2, name: 'Omen Nippon', meta: 'food · 4 min walk', lat: 35.02, lng: 135.78 },
];

const ORIGIN = { lat: 35.0, lng: 135.77 };

const CLOSING = 'Nothing here changes the plan. Pick one up and the day carries on.';

describe('NearbyPanel', () => {
  it('renders the eyebrow, heading, blurb and closing line in the rail', () => {
    render(
      <NearbyPanel
        layout="rail"
        heading="Around Nanzen-ji"
        blurb="Three kept places within a short walk."
        places={PLACES}
        origin={ORIGIN}
      />,
    );

    expect(screen.getByText('AROUND YOU NOW')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Around Nanzen-ji' })).toBeInTheDocument();
    expect(screen.getByText('Three kept places within a short walk.')).toBeInTheDocument();
    expect(screen.getByText(CLOSING)).toBeInTheDocument();
  });

  it('renders the same head in the overlay, as a dialog named by its heading', () => {
    render(
      <NearbyPanel
        layout="overlay"
        heading="Around you"
        blurb="Three kept places within a short walk."
        places={PLACES}
        origin={ORIGIN}
        onClose={() => {}}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Around you' });
    expect(within(dialog).getByText('AROUND YOU NOW')).toBeInTheDocument();
    expect(within(dialog).getByText('Three kept places within a short walk.')).toBeInTheDocument();
    expect(within(dialog).getByText(CLOSING)).toBeInTheDocument();
  });

  it('draws nothing for an empty blurb', () => {
    const { rerender } = render(
      <NearbyPanel layout="rail" heading="Around you" blurb="Two kept places nearby." places={PLACES} origin={ORIGIN} />,
    );
    expect(screen.getByText('Two kept places nearby.')).toBeInTheDocument();

    rerender(<NearbyPanel layout="rail" heading="Around you" blurb="" places={PLACES} origin={ORIGIN} />);
    expect(screen.queryByText('Two kept places nearby.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Around you' })).toBeInTheDocument();
  });

  it('lists every place with its name and meta', () => {
    render(<NearbyPanel layout="rail" heading="Around you" blurb="" places={PLACES} origin={null} />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Nanzen-ji')).toBeInTheDocument();
    expect(within(items[0]!).getByText('sight · 12 min walk')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Omen Nippon')).toBeInTheDocument();
    expect(within(items[1]!).getByText('food · 4 min walk')).toBeInTheDocument();
  });

  it('shows the × only in the overlay, and only when there is something to close to', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <NearbyPanel layout="rail" heading="Around you" blurb="" places={PLACES} origin={ORIGIN} onClose={onClose} />,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    rerender(<NearbyPanel layout="overlay" heading="Around you" blurb="" places={PLACES} origin={ORIGIN} />);
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    rerender(
      <NearbyPanel layout="overlay" heading="Around you" blurb="" places={PLACES} origin={ORIGIN} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes the overlay on Escape', async () => {
    const onClose = vi.fn();
    render(
      <NearbyPanel layout="overlay" heading="Around you" blurb="" places={PLACES} origin={ORIGIN} onClose={onClose} />,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not answer Escape when it is the desktop rail', async () => {
    const onClose = vi.fn();
    render(
      <NearbyPanel layout="rail" heading="Around you" blurb="" places={PLACES} origin={ORIGIN} onClose={onClose} />,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('maps the places that have coordinates, at the height its layout asks for', () => {
    const { rerender } = render(
      <NearbyPanel layout="overlay" heading="Around you" blurb="" places={PLACES} origin={ORIGIN} />,
    );

    expect(screen.getByTestId('map-fit')).toHaveTextContent('fit: true');
    expect(screen.getByTestId('map-height')).toHaveTextContent('height: 320');
    const map = screen.getByTestId('map-view');
    expect(within(map).getByText('Nanzen-ji (potential)')).toBeInTheDocument();
    expect(within(map).getByText('Omen Nippon (potential)')).toBeInTheDocument();

    rerender(<NearbyPanel layout="rail" heading="Around you" blurb="" places={PLACES} origin={ORIGIN} />);
    expect(screen.getByTestId('map-height')).toHaveTextContent('height: 260');
  });

  it('marks where you are on the map, and says what the mark means', () => {
    render(<NearbyPanel layout="overlay" heading="Around you" blurb="" places={PLACES} origin={ORIGIN} />);

    expect(screen.getByTestId('map-origin')).toHaveTextContent('origin: 35,135.77');
    expect(screen.getByText('Where you are now')).toBeInTheDocument();
  });

  it('omits the map when we do not know where you are', () => {
    render(<NearbyPanel layout="overlay" heading="Around you" blurb="" places={PLACES} origin={null} />);

    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument();
    expect(screen.queryByText('Where you are now')).not.toBeInTheDocument();
    expect(screen.getByText('Nanzen-ji')).toBeInTheDocument();
  });

  it('omits the map when no place has coordinates', () => {
    const flat: NearbyPlace[] = [{ id: 3, name: 'A note to self', meta: '', lat: null, lng: null }];
    render(<NearbyPanel layout="rail" heading="Around you" blurb="" places={flat} origin={ORIGIN} />);

    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument();
    expect(screen.queryByText('Where you are now')).not.toBeInTheDocument();
    expect(screen.getByText('A note to self')).toBeInTheDocument();
  });

  it('shows a note in place of the list', () => {
    render(
      <NearbyPanel
        layout="rail"
        heading="Around you"
        blurb=""
        places={PLACES}
        origin={null}
        note="Nothing kept within a short walk of here."
      />,
    );

    expect(screen.getByText('Nothing kept within a short walk of here.')).toBeInTheDocument();
    expect(screen.queryByText('Nanzen-ji')).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('says it is still looking while loading', () => {
    render(<NearbyPanel layout="rail" heading="Around you" blurb="" places={[]} origin={ORIGIN} loading />);

    expect(screen.getByRole('status')).toHaveTextContent('Looking around');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
