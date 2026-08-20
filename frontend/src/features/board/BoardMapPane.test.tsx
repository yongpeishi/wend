import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardMapPane } from './BoardMapPane';
import type { BoardMapPaneProps } from './BoardMapPane';
import type { MapViewProps } from '../map/MapView';
import type { MapPin } from '../map/types';

// The real MapView needs a layout engine jsdom doesn't have (see the note in
// MapView.tsx), so the pane is tested through the seam: what pins — and what
// marks on them — it hands down, and what chrome it draws around the map.
vi.mock('../map/MapView', () => ({
  MapView: (props: MapViewProps) => (
    <div data-testid="map-view">
      <ul>
        {props.pins.map((pin) => (
          <li key={pin.id} data-testid={`pin-${pin.id}`}>
            {pin.title} mark:{String(pin.mark)} tone:{String(pin.tone)}
          </li>
        ))}
      </ul>
    </div>
  ),
}));

function pin(id: number, overrides: Partial<MapPin> = {}): MapPin {
  return { id, lat: 35 + id, lng: 135 + id, title: `Place ${id}`, state: 'potential', ...overrides };
}

function renderPane(overrides: Partial<BoardMapPaneProps> = {}) {
  return render(
    <BoardMapPane
      pins={overrides.pins ?? [pin(1, { tone: 'inView' }), pin(2, { tone: 'offView' })]}
      selectedId={null}
      onSelectPin={vi.fn()}
      onSelectCluster={vi.fn()}
      onBoundsChange={vi.fn()}
      fitRequest={0}
      following
      offCount={0}
      onWiden={vi.fn()}
      {...overrides}
    />,
  );
}

describe('BoardMapPane', () => {
  describe('labeledIds', () => {
    it('marks pins in the set as chips and every other pin as a dot', () => {
      renderPane({ labeledIds: new Set([1]) });
      expect(screen.getByTestId('pin-1')).toHaveTextContent('mark:chip');
      expect(screen.getByTestId('pin-2')).toHaveTextContent('mark:dot');
    });

    it('passes pins through untouched when absent — today’s tone rendering', () => {
      renderPane();
      expect(screen.getByTestId('pin-1')).toHaveTextContent('mark:undefined tone:inView');
      expect(screen.getByTestId('pin-2')).toHaveTextContent('mark:undefined tone:offView');
    });

    it('shows the chip/dot caption only alongside the split it explains', () => {
      const caption = /Labelled ones are in the list you’re viewing/;
      const { unmount } = renderPane({ labeledIds: new Set([1]) });
      expect(screen.getByText(caption)).toBeInTheDocument();
      unmount();

      renderPane();
      expect(screen.queryByText(caption)).not.toBeInTheDocument();
    });

    it('marks every pin a dot when the visible list has none of them', () => {
      renderPane({ labeledIds: new Set() });
      expect(screen.getByTestId('pin-1')).toHaveTextContent('mark:dot');
      expect(screen.getByTestId('pin-2')).toHaveTextContent('mark:dot');
    });
  });

  describe('onHide', () => {
    it('draws the header row and wires the Hide map button', async () => {
      const user = userEvent.setup();
      const onHide = vi.fn();
      renderPane({ onHide });

      expect(screen.getByText('Map')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Hide map' }));
      expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('draws no header at all when absent — the caller owns the chrome', () => {
      renderPane();
      expect(screen.queryByText('Map')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Hide map' })).not.toBeInTheDocument();
    });
  });

  describe('existing chrome', () => {
    it('still says how many ideas the view cut, and still offers Widen', async () => {
      const user = userEvent.setup();
      const onWiden = vi.fn();
      renderPane({ offCount: 3, onWiden, labeledIds: new Set([1]) });

      expect(screen.getByText('3 ideas outside this view')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Widen' }));
      expect(onWiden).toHaveBeenCalledTimes(1);
    });

    it('still explains itself while the list is not following the map', () => {
      renderPane({ following: false });
      expect(screen.getByText('The list is not following the map')).toBeInTheDocument();
    });
  });
});
