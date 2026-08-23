import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MapSearch } from './MapSearch';
import type { LocatedEntry } from './mapScreen';
import type { Entry } from '../../api/types';
import type { Bounds, GeocodeResult } from './types';

function makeLocated(overrides: Partial<Entry> & { lat?: number; lng?: number }): LocatedEntry {
  return {
    id: 1,
    kind: 'idea',
    title: 'Untitled',
    description: null,
    category: null,
    starts_on: null,
    ends_on: null,
    address: null,
    lat: 35.0,
    lng: 135.0,
    duration_minutes: null,
    source_url: null,
    notes: null,
    from_entry_id: null,
    to_entry_id: null,
    pros: [],
    cons: [],
    archived_at: null,
    created_at: '',
    updated_at: '',
    parent_ids: [],
    children_count: 0,
    todos_open_count: 0,
    vote_tally: { total: 0, count: 0, average: 0 },
    my_vote: null,
    scheduled: false,
    ...overrides,
  } as LocatedEntry;
}

function makePlace(overrides: Partial<GeocodeResult> = {}): GeocodeResult {
  return { lat: 35.0116, lng: 135.7681, label: 'Nanzen-ji, Kyoto, Japan', kind: 'attraction', ...overrides };
}

const noop = () => undefined;

interface Overrides {
  ideas?: LocatedEntry[];
  canEdit?: boolean;
  clearNonce?: number;
  bounds?: Bounds | null;
  searchFn?: (query: string, options?: { signal?: AbortSignal; viewbox?: Bounds }) => Promise<GeocodeResult[]>;
  onPickIdea?: (id: number) => void;
  onPickPlace?: (place: GeocodeResult) => void;
  onDropPinIntent?: (query: string) => void;
}

function renderSearch(overrides: Overrides = {}) {
  const props = {
    ideas: [] as LocatedEntry[],
    canEdit: true,
    searchFn: vi.fn().mockResolvedValue([]),
    onPickIdea: noop,
    onPickPlace: noop,
    onDropPinIntent: noop,
    ...overrides,
  };
  return { ...render(<MapSearch {...props} />), props };
}

describe('MapSearch', () => {
  it('matches located ideas instantly under "On your map", and picking one calls onPickIdea and resets', async () => {
    const user = userEvent.setup();
    const onPickIdea = vi.fn();
    const ideas = [makeLocated({ id: 7, title: 'Nanzen-ji temple' }), makeLocated({ id: 8, title: 'Fushimi Inari' })];
    renderSearch({ ideas, onPickIdea });

    await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'nanzen');

    // Instant — no debounce wait, no network round-trip.
    expect(screen.getByText('On your map · 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nanzen-ji temple' }));

    expect(onPickIdea).toHaveBeenCalledWith(7);
    expect(screen.getByRole('textbox', { name: 'Search the map' })).toHaveValue('');
    expect(screen.queryByText('On your map · 1')).not.toBeInTheDocument();
  });

  it('caps idea matches at three', async () => {
    const user = userEvent.setup();
    const ideas = [1, 2, 3, 4, 5].map((id) => makeLocated({ id, title: `Temple ${id}` }));
    renderSearch({ ideas });

    await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'temple');

    expect(screen.getByText('On your map · 3')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Temple \d/ })).toHaveLength(3);
  });

  it('debounces typed text into one place search and lists results under "Places · not yours yet"', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    const onPickPlace = vi.fn();
    renderSearch({ searchFn, onPickPlace });

    await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'nanzenji');

    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));
    expect(searchFn).toHaveBeenCalledWith('nanzenji', expect.anything());

    expect(await screen.findByText('Places · not yours yet')).toBeInTheDocument();
    const row = screen.getByRole('button', { name: /Nanzen-ji, Kyoto, Japan/ });
    // The row carries the kind as its meta line.
    expect(row).toHaveTextContent('attraction');

    await user.click(row);
    expect(onPickPlace).toHaveBeenCalledWith(makePlace());
    expect(screen.getByRole('textbox', { name: 'Search the map' })).toHaveValue('');
  });

  it('shows at most four places even when the search returns more', async () => {
    const user = userEvent.setup();
    const searchFn = vi
      .fn()
      .mockResolvedValue([1, 2, 3, 4, 5].map((n) => makePlace({ label: `Place ${n}`, lat: n, kind: undefined })));
    renderSearch({ searchFn });

    await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'place');

    expect(await screen.findByText('Places · not yours yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Place \d/ })).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Place 5' })).not.toBeInTheDocument();
  });

  it('never shows the Places section to a viewer, even when the search finds some', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([makePlace()]);
    renderSearch({ searchFn, canEdit: false, ideas: [makeLocated({ id: 3, title: 'Nanzen-ji walk' })] });

    await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'nanzen');
    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));

    // Ideas still match; the not-yours-yet half of the panel is edit-only.
    expect(screen.getByText('On your map · 1')).toBeInTheDocument();
    expect(screen.queryByText('Places · not yours yet')).not.toBeInTheDocument();
  });

  it('offers the drop-a-pin path when a completed search and the ideas both come up empty', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([]);
    const onDropPinIntent = vi.fn();
    renderSearch({ searchFn, onDropPinIntent });

    await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'nowhere at all');

    expect(
      await screen.findByText(/Nothing by that name\. You can put it on the map yourself — click where it is\./),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Click where it is' }));

    expect(onDropPinIntent).toHaveBeenCalledWith('nowhere at all');
    expect(screen.getByRole('textbox', { name: 'Search the map' })).toHaveValue('');
  });

  it('gives viewers the no-matches sentence without the pin path', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([]);
    renderSearch({ searchFn, canEdit: false });

    await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'nowhere at all');

    expect(await screen.findByText('Nothing by that name.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Click where it is' })).not.toBeInTheDocument();
  });

  it('absorbs a rejecting searchFn as an empty result instead of crashing', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockRejectedValue(new Error('network down'));
    renderSearch({ searchFn });

    await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'somewhere remote');

    await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Nothing by that name\./)).toBeInTheDocument();
  });

  describe('viewport bias', () => {
    const kyoto: Bounds = { north: 35.1, south: 34.95, east: 135.85, west: 135.65 };
    const osaka: Bounds = { north: 34.75, south: 34.6, east: 135.6, west: 135.4 };

    it('hands the map’s current viewport to the search as its viewbox', async () => {
      const user = userEvent.setup();
      const searchFn = vi.fn().mockResolvedValue([]);
      renderSearch({ searchFn, bounds: kyoto });

      await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'nanzenji');

      await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));
      expect(searchFn.mock.calls[0]![1]).toMatchObject({ viewbox: kyoto });
    });

    it('carries no viewbox when the map has no bounds to offer', async () => {
      const user = userEvent.setup();
      const searchFn = vi.fn().mockResolvedValue([]);
      renderSearch({ searchFn, bounds: null });

      await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'nanzenji');

      await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));
      expect(searchFn.mock.calls[0]![1]!.viewbox).toBeUndefined();
    });

    it('biases toward where the map is when the search FIRES, not when the key was pressed', async () => {
      // The debounce means those are different moments; a viewport read from
      // the keystroke's closure would search Kyoto after you'd panned to Osaka.
      const user = userEvent.setup();
      const searchFn = vi.fn().mockResolvedValue([]);
      const props = {
        ideas: [] as LocatedEntry[],
        canEdit: true,
        searchFn,
        onPickIdea: noop,
        onPickPlace: noop,
        onDropPinIntent: noop,
      };
      const { rerender } = render(<MapSearch {...props} bounds={kyoto} />);

      await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'castle');
      rerender(<MapSearch {...props} bounds={osaka} />);

      await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));
      expect(searchFn.mock.calls[0]![1]).toMatchObject({ viewbox: osaka });
    });

    it('does not re-run the geocode when the map merely pans', async () => {
      // Bounds change on every frame of a drag. They are an input to the next
      // search, never a trigger for one — Nominatim's 1/sec budget depends on it.
      const user = userEvent.setup();
      const searchFn = vi.fn().mockResolvedValue([]);
      const props = {
        ideas: [] as LocatedEntry[],
        canEdit: true,
        searchFn,
        onPickIdea: noop,
        onPickPlace: noop,
        onDropPinIntent: noop,
      };
      const { rerender } = render(<MapSearch {...props} bounds={kyoto} />);

      await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'castle');
      await waitFor(() => expect(searchFn).toHaveBeenCalledTimes(1));

      rerender(<MapSearch {...props} bounds={osaka} />);
      rerender(<MapSearch {...props} bounds={kyoto} />);

      expect(searchFn).toHaveBeenCalledTimes(1);
    });

    it('orders idea matches nearest to the viewport centre, so the cap keeps what you can see', async () => {
      const user = userEvent.setup();
      const ideas = [
        makeLocated({ id: 1, title: 'Tokyo Temple', lat: 35.71, lng: 139.8 }),
        makeLocated({ id: 2, title: 'Osaka Temple', lat: 34.69, lng: 135.5 }),
        makeLocated({ id: 3, title: 'Kyoto Temple', lat: 35.03, lng: 135.77 }),
      ];
      renderSearch({ ideas, bounds: kyoto });

      await user.type(screen.getByRole('textbox', { name: 'Search the map' }), 'temple');

      const rows = screen.getAllByRole('button', { name: /Temple/ });
      expect(rows.map((r) => r.textContent)).toEqual(['Kyoto Temple', 'Osaka Temple', 'Tokyo Temple']);
    });
  });

  it('clears the field on a clearNonce bump, but never on the initial value', async () => {
    const user = userEvent.setup();
    const searchFn = vi.fn().mockResolvedValue([]);
    const props = {
      ideas: [makeLocated({ id: 1, title: 'Nanzen-ji' })],
      canEdit: true,
      searchFn,
      onPickIdea: noop,
      onPickPlace: noop,
      onDropPinIntent: noop,
    };
    const { rerender } = render(<MapSearch {...props} clearNonce={5} />);

    const field = screen.getByRole('textbox', { name: 'Search the map' });
    await user.type(field, 'nanzen');
    expect(screen.getByText('On your map · 1')).toBeInTheDocument();

    // Same nonce → nothing happens.
    rerender(<MapSearch {...props} clearNonce={5} />);
    expect(field).toHaveValue('nanzen');

    // Bumped nonce → field and results reset.
    rerender(<MapSearch {...props} clearNonce={6} />);
    expect(field).toHaveValue('');
    expect(screen.queryByText('On your map · 1')).not.toBeInTheDocument();
  });
});
