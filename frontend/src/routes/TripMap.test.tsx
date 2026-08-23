import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { server } from '../mocks/server';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { setRole } from '../mocks/db';
import { TripMap } from './TripMap';
import type { Entry, TripRole } from '../api/types';
import type { MapViewProps } from '../features/map/MapView';
import type { GeocodeResult } from '../features/map/types';

/**
 * The capture flows here string several user events, a 400ms search debounce
 * and MSW round-trips together; the 5s default is not comfortable on a loaded
 * machine and nothing in this file is a performance assertion.
 */
vi.setConfig({ testTimeout: 15_000 });

/**
 * jsdom has no layout engine, so a real Leaflet map cannot mount here (see
 * MapView.tsx's own doc comment) — the seam is mocked to a stub exposing
 * every prop this route wires: the pins with the mark the route decided for
 * them (chip = in the list, dot = out of view, faint = filtered out), the
 * fit and view nonces, the pending-location ring, and buttons that fire what
 * a pan / a pin / a cluster / a bare map click would fire. The wiring under
 * test is the route's, not Leaflet's.
 *
 * The stub deliberately does NOT report bounds on mount — "the map is open
 * but has not said where it is looking yet" stays a state these tests pass
 * through, and it is why the list opens uncut.
 */
vi.mock('../features/map/MapView', () => ({
  MapView: (props: MapViewProps) => (
    <div data-testid="map-view">
      <p data-testid="fit-request">fit: {String(props.fitRequest)}</p>
      <p data-testid="view-request">
        view:{' '}
        {props.viewRequest
          ? `${props.viewRequest.nonce}:${props.viewRequest.points.map((p) => p.id).join(',')}`
          : 'none'}
      </p>
      <p data-testid="pending">
        pending: {props.pendingLocation ? `${props.pendingLocation.lat},${props.pendingLocation.lng}` : 'none'}
      </p>
      {/* Only when the route actually bound a handler — the real MapView binds
          its click listener the same way, so "no handler" must be visible here
          rather than a button that quietly does nothing. */}
      {props.onMapClick && (
        <button type="button" onClick={() => props.onMapClick?.(35.02, 135.77)}>
          Simulate map click
        </button>
      )}
      <button
        type="button"
        onClick={() => props.onBoundsChange?.({ north: 35.02, south: 35.01, east: 135.78, west: 135.76 })}
      >
        Simulate pan to Nanzen-ji only
      </button>
      <button type="button" onClick={() => props.onSelectCluster?.(props.pins.map((pin) => pin.id))}>
        Simulate cluster click
      </button>
      <ul>
        {props.pins.map((pin) => (
          <li key={pin.id}>
            <button type="button" onClick={() => props.onSelectPin?.(pin.id)}>
              {pin.title} ({pin.mark ?? 'unmarked'})
            </button>
          </li>
        ))}
      </ul>
    </div>
  ),
}));

/**
 * MapSearch is rendered for real — its debounce, sections and dead-end are
 * part of what the route wires — but its network seam is stubbed: geocoding
 * in a test would be a real call to Nominatim. Hoisted because the mock
 * factory runs before module scope does.
 */
const { searchPlaceMock } = vi.hoisted(() => ({
  searchPlaceMock: vi.fn<(query: string, options?: { signal?: AbortSignal }) => Promise<GeocodeResult[]>>(),
}));
vi.mock('../features/map/geocode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/map/geocode')>()),
  searchPlace: searchPlaceMock,
}));

beforeEach(() => {
  searchPlaceMock.mockReset();
  searchPlaceMock.mockResolvedValue([]);
});

// TripMap reads `trip` from useOutletContext, which only exists inside an
// <Outlet> — routed through a stand-in layout, the same shape TripLayout gives.
function TestTripLayout() {
  return <Outlet context={{ trip: { id: 1, title: 'Six days in Kyoto' } }} />;
}

/** `role` mounts the provider TripLayout mounts in the app. Omitted, the
 * context hands back its editable default. */
function renderMap(role?: TripRole) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const map = (
    <MemoryRouter initialEntries={['/trips/1/map']}>
      <Routes>
        <Route path="/trips/:id" element={<TestTripLayout />}>
          <Route path="map" element={<TripMap />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{role ? <TripRoleProvider role={role}>{map}</TripRoleProvider> : map}</ToastProvider>
    </QueryClientProvider>,
  );
}

/**
 * Seeded trip 1 (src/mocks/db.ts) holds seven ideas. Two are located —
 * Nanzen-ji (id 2, 35.0116/135.7681, category place, scheduled) and Kiyamachi
 * (id 3, 35.0086/135.7717, category activity, potential) — and five have no
 * coordinates. The simulated pan above is a box around Nanzen-ji alone.
 */
const NANZENJI_ID = 2;
const KIYAMACHI_ID = 3;
const MARKET_BUNDLE_ID = 4;
/** Three members, none of them located — the plan the map cannot draw. */
const MARKET_BUNDLE_TITLE = 'Nishiki market crawl';
/** Three members, exactly one of them located: Kiyamachi. */
const NIGHT_BUNDLE_TITLE = 'A night out in Pontocho';

/** Every screen paint starts with the located rows arriving. */
async function listUp() {
  // The row's NAME button has the bare title; the pin button carries its mark.
  await screen.findByRole('button', { name: 'Nanzen-ji' });
}

/** Types into the map search overlay and waits out its debounce via findBy. */
async function searchTheMap(user: ReturnType<typeof userEvent.setup>, query: string) {
  await user.type(screen.getByRole('textbox', { name: 'Search the map' }), query);
}

describe('TripMap — the map decides the list', () => {
  it('lists only located ideas as rows, keeps the placeless in the footer, and counts in follow words', async () => {
    renderMap();
    await listUp();

    expect(screen.getByRole('button', { name: 'Kiyamachi' })).toBeInTheDocument();
    // Following from the first paint, before the map has reported bounds:
    // nothing is cut yet, and the counter says so as a full fraction.
    expect(screen.getByText('2 of 2 ideas on the map are in view')).toBeInTheDocument();

    // The five unlocated ideas are footer material, never rows.
    expect(screen.getByText('5 ideas have no place yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Coffee at Weekenders' })).not.toBeInTheDocument();

    // And both located ideas are chip pins — in the list you are reading.
    expect(screen.getByRole('button', { name: 'Nanzen-ji (chip)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiyamachi (chip)' })).toBeInTheDocument();
  });

  it('panning with follow on cuts the list, demotes the pin to a dot, and offers the way back', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));

    expect(screen.getByText('1 of 2 ideas on the map are in view')).toBeInTheDocument();
    // Kiyamachi leaves the LIST but never the map: a dot now, not an absence.
    expect(screen.queryByRole('button', { name: 'Kiyamachi' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiyamachi (dot)' })).toBeInTheDocument();

    // The quiet escape hatch bumps the fit nonce — it moves the MAP wider,
    // never the list directly.
    expect(screen.getByTestId('fit-request')).toHaveTextContent('fit: 0');
    await user.click(screen.getByRole('button', { name: 'zoom out to widen' }));
    expect(screen.getByTestId('fit-request')).toHaveTextContent('fit: 1');
  });

  it('turning follow off gives the whole list back without moving the map, and pans stop cutting', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));
    expect(screen.queryByRole('button', { name: 'Kiyamachi' })).not.toBeInTheDocument();

    const follow = screen.getByRole('button', { name: /follow map/ });
    expect(follow).toHaveAttribute('aria-pressed', 'true');
    await user.click(follow);
    expect(follow).toHaveAttribute('aria-pressed', 'false');

    // The list is whole again and the counter switches vocabulary.
    expect(screen.getByRole('button', { name: 'Kiyamachi' })).toBeInTheDocument();
    expect(screen.getByText('2 ideas have a place · the map is not narrowing the list')).toBeInTheDocument();
    // Toggling follow never moved the map: no fit, no view request.
    expect(screen.getByTestId('fit-request')).toHaveTextContent('fit: 0');
    expect(screen.getByTestId('view-request')).toHaveTextContent('view: none');
    // And the viewport-cut escape hatch has nothing to escape from.
    expect(screen.queryByRole('button', { name: 'zoom out to widen' })).not.toBeInTheDocument();

    // A further pan changes nothing about the list while follow is off.
    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));
    expect(screen.getByRole('button', { name: 'Kiyamachi' })).toBeInTheDocument();
  });

  it('a filtered-out idea keeps a faint dot — filters hide rows, never pins', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await user.type(screen.getByRole('searchbox', { name: 'Search ideas' }), 'nanzen');

    // One count line on this screen, and it is the map's richer one — see the
    // control row's doc.
    expect(screen.getByText('1 of 2 ideas on the map are in view')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kiyamachi' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiyamachi (faint)' })).toBeInTheDocument();
  });

  it('says where the ideas went when the view holds none of them', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await user.type(screen.getByRole('searchbox', { name: 'Search ideas' }), 'zzz');

    expect(
      screen.getByText('No ideas in view. Zoom out, or clear a chip — they are all still on the board.'),
    ).toBeInTheDocument();
    // Faint, not gone: the map still shows everything the board holds.
    expect(screen.getByRole('button', { name: 'Nanzen-ji (faint)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiyamachi (faint)' })).toBeInTheDocument();
  });
});

describe('TripMap — selection is one set, list and pins', () => {
  it('a row tick and a pin click toggle the same selection', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    // The empty bar teaches the gesture.
    expect(screen.getByText(/Tick ideas in the list or click their pins/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Nanzen-ji' }));
    expect(screen.getByText('1 idea selected')).toBeInTheDocument();

    // The pin click UNticks the same idea — one set, two doors.
    await user.click(screen.getByRole('button', { name: 'Nanzen-ji (chip)' }));
    expect(screen.queryByText('1 idea selected')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Nanzen-ji' })).not.toBeChecked();
    expect(screen.getByText(/Tick ideas in the list or click their pins/)).toBeInTheDocument();
  });

  it('opening a cluster selects everything inside it', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await user.click(screen.getByRole('button', { name: 'Simulate cluster click' }));

    expect(screen.getByText('2 ideas selected')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Nanzen-ji' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Kiyamachi' })).toBeChecked();
  });

  it('a row name click is navigation, not selection', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    const name = screen.getByRole('button', { name: 'Nanzen-ji' });
    expect(name).toHaveAttribute('aria-expanded', 'false');
    await user.click(name);

    // The map was pointed at the idea…
    expect(screen.getByTestId('view-request')).toHaveTextContent(`view: 1:${NANZENJI_ID}`);
    // …the row unfolded…
    expect(screen.getByRole('button', { name: 'Nanzen-ji' })).toHaveAttribute('aria-expanded', 'true');
    // …and nothing was ticked. Still the whole point of this test: the name is
    // never a way to select, however much else it now does.
    expect(screen.getByRole('checkbox', { name: 'Nanzen-ji' })).not.toBeChecked();
    expect(screen.queryByText('1 idea selected')).not.toBeInTheDocument();
  });
});

/**
 * The control row is the board's, plus the two controls only this screen has:
 * the plans dropdown and the follow switch. These tests are about where things
 * live and what each one still promises — not about the filtering arithmetic,
 * which mapFilters.test.ts owns.
 */
describe('TripMap — the control row', () => {
  it('keeps the chips and the screen’s promise behind Filter', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    // Nothing on the surface until asked for.
    expect(screen.queryByRole('button', { name: 'Scheduled' })).not.toBeInTheDocument();
    expect(screen.queryByText(/faint dot on the map/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter' }));

    // "What" and "State", the board's own two sections.
    expect(screen.getByRole('button', { name: 'Place' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scheduled' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Potential' })).toBeInTheDocument();
    // The sentence went in with the chips it explains, and was not lost.
    expect(
      screen.getByText('Filtered ideas keep a faint dot on the map. Nothing leaves your board.'),
    ).toBeInTheDocument();
  });

  it('echoes each lit filter as a chip that removes its own narrowing', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('button', { name: 'Scheduled' }));

    // The count is on the trigger in words as well as in the badge.
    expect(screen.getByRole('button', { name: 'Filter (1 active)' })).toBeInTheDocument();
    expect(screen.getByText('Filtered, not gone — clear a chip to widen again.')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 ideas on the map are in view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiyamachi (faint)' })).toBeInTheDocument();

    // The chip is its own undo.
    await user.click(screen.getByRole('button', { name: 'Remove Scheduled filter' }));

    expect(screen.getByText('2 of 2 ideas on the map are in view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.queryByText('Filtered, not gone — clear a chip to widen again.')).not.toBeInTheDocument();
  });

  it('groups with the board’s own segmented control', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    const tabs = screen.getByRole('tablist', { name: 'Group ideas' });
    expect(within(tabs).getByRole('tab', { name: 'Ungrouped' })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(tabs).getByRole('tab', { name: 'By category' }));

    expect(within(tabs).getByRole('tab', { name: 'By category' })).toHaveAttribute('aria-selected', 'true');
    // The two located ideas fall under their own headings.
    expect(screen.getByText('Place')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });
});

/**
 * Picking a plan is a narrowing that also MOVES the map — the only one on this
 * screen that does. "Show me Tuesday" is a request to see Tuesday.
 */
describe('TripMap — reading one plan', () => {
  /**
   * Opens the dropdown and waits for the memberships to land. The fit reads the
   * plan's members at the moment of the click, so a test that picked before
   * they arrived would be asserting on a race, not on the behaviour. Both
   * seeded plans hold three ideas; the counts arriving in the panel are the
   * memberships arriving.
   */
  async function openLoadedPlans(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /^Plans/ }));
    await waitFor(() => expect(screen.getAllByText('3 ideas')).toHaveLength(2));
  }

  /**
   * The open panel, scoped. Once a plan is picked the trigger reads its title
   * too, so a bare query for a plan name would find both the row and the
   * control saying which row is current.
   */
  function plansPanel() {
    return within(screen.getByRole('group', { name: 'Plans' }));
  }

  it('narrows the list to the plan’s ideas and takes the map to them', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await openLoadedPlans(user);
    await user.click(plansPanel().getByRole('button', { name: new RegExp(NIGHT_BUNDLE_TITLE) }));

    // Kiyamachi is the plan's one located member; Nanzen-ji is in no plan.
    expect(screen.getByRole('button', { name: 'Kiyamachi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nanzen-ji' })).not.toBeInTheDocument();
    // Filtered out of the reading, never off the map.
    expect(screen.getByRole('button', { name: 'Nanzen-ji (faint)' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 ideas on the map are in view')).toBeInTheDocument();

    // The map was fitted to the plan's located members…
    expect(screen.getByTestId('view-request')).toHaveTextContent(`view: 1:${KIYAMACHI_ID}`);
    // …and the trigger says what is being read.
    expect(screen.getByRole('button', { name: `Plans ${NIGHT_BUNDLE_TITLE}` })).toBeInTheDocument();
  });

  it('picking the same plan again widens back, and never moves the map to do it', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await openLoadedPlans(user);
    await user.click(plansPanel().getByRole('button', { name: new RegExp(NIGHT_BUNDLE_TITLE) }));
    const afterPick = screen.getByTestId('view-request').textContent as string;

    await user.click(screen.getByRole('button', { name: /^Plans/ }));
    await user.click(plansPanel().getByRole('button', { name: new RegExp(NIGHT_BUNDLE_TITLE) }));

    expect(screen.getByRole('button', { name: 'Nanzen-ji' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2 ideas on the map are in view')).toBeInTheDocument();
    // Widening leaves you where you were looking — the follow switch's rule.
    expect(screen.getByTestId('view-request')).toHaveTextContent(afterPick);
  });

  it('"All plans" is the named way out', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await openLoadedPlans(user);
    await user.click(plansPanel().getByRole('button', { name: new RegExp(NIGHT_BUNDLE_TITLE) }));
    expect(screen.queryByRole('button', { name: 'Nanzen-ji' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Plans/ }));
    await user.click(plansPanel().getByRole('button', { name: 'All plans' }));

    expect(screen.getByRole('button', { name: 'Nanzen-ji' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Plans 2$/ })).toBeInTheDocument();
  });

  it('a plan with nothing on the map narrows the list but does not move the map', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await openLoadedPlans(user);
    // Every member of the market crawl is placeless.
    await user.click(plansPanel().getByRole('button', { name: new RegExp(MARKET_BUNDLE_TITLE) }));

    expect(screen.queryByRole('button', { name: 'Nanzen-ji' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kiyamachi' })).not.toBeInTheDocument();
    expect(
      screen.getByText('No ideas in view. Zoom out, or clear a chip — they are all still on the board.'),
    ).toBeInTheDocument();
    // A fit to nothing is a jump to nowhere: the map stayed where it was.
    expect(screen.getByTestId('view-request')).toHaveTextContent('view: none');
  });
});

describe('TripMap — putting a placeless idea on the map', () => {
  it('put-on-map enters drop mode, a map click places the point, and the save writes the coordinates', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await user.click(screen.getByRole('button', { name: 'Show them ›' }));
    const row = screen.getByText('Coffee at Weekenders').closest('div') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Put it on the map' }));

    // Aiming: the banner names the idea, and no point exists yet.
    expect(screen.getByText('Click where Coffee at Weekenders is')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Simulate map click' }));

    // The click landed as the pending ring and raised the confirm card.
    expect(screen.getByTestId('pending')).toHaveTextContent('pending: 35.02,135.77');
    expect(screen.getByText('Putting Coffee at Weekenders on the map')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save the place' }));

    expect(await screen.findByText('Coffee at Weekenders is on the map now. It joins the list.')).toBeInTheDocument();
    // The update wrote lat/lng: the idea now clusters with the located ones…
    expect(await screen.findByRole('button', { name: 'Coffee at Weekenders (chip)' })).toBeInTheDocument();
    // …and the mode stood down: ring off, card gone.
    expect(screen.getByTestId('pending')).toHaveTextContent('pending: none');
    expect(screen.queryByRole('button', { name: 'Save the place' })).not.toBeInTheDocument();

    const { entries } = await api.get<{ entries: Entry[] }>('/entries', {
      params: { trip_id: 1, kind: 'idea' },
    });
    const coffee = entries.find((e) => e.title === 'Coffee at Weekenders') as Entry;
    expect(coffee.lat).toBe(35.02);
    expect(coffee.lng).toBe(135.77);
  });

  it('Escape while aiming stands the drop down — the banner goes, and a map click is a plain click again', async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await user.click(screen.getByRole('button', { name: 'Show them ›' }));
    const row = screen.getByText('Coffee at Weekenders').closest('div') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Put it on the map' }));
    expect(screen.getByText('Click where Coffee at Weekenders is')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByText('Click where Coffee at Weekenders is')).not.toBeInTheDocument();
    // The mode is genuinely gone, not just the banner: a further click drops
    // nothing and raises no card.
    await user.click(screen.getByRole('button', { name: 'Simulate map click' }));
    expect(screen.queryByText('Putting Coffee at Weekenders on the map')).not.toBeInTheDocument();
    expect(screen.getByTestId('pending')).toHaveTextContent('pending: none');
  });

  it("the banner's own Cancel exits the same way", async () => {
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await user.click(screen.getByRole('button', { name: 'Show them ›' }));
    const row = screen.getByText('Coffee at Weekenders').closest('div') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Put it on the map' }));
    expect(screen.getByText('Click where Coffee at Weekenders is')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Click where Coffee at Weekenders is')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Simulate map click' }));
    expect(screen.queryByText('Putting Coffee at Weekenders on the map')).not.toBeInTheDocument();
    expect(screen.getByTestId('pending')).toHaveTextContent('pending: none');
  });
});

describe('TripMap — search the map', () => {
  const GINKAKUJI: GeocodeResult = {
    lat: 35.0271,
    lng: 135.7982,
    label: 'Ginkaku-ji, Sakyo Ward, Kyoto',
    kind: 'attraction',
  };

  it('a picked place previews with the ring, and "Add as idea" keeps name, address, coords and category', async () => {
    searchPlaceMock.mockResolvedValue([GINKAKUJI]);
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await searchTheMap(user, 'ginkaku');
    await user.click(await screen.findByRole('button', { name: /Ginkaku-ji, Sakyo Ward/ }));

    // The preview: apricot ring on the point, the view centred on it.
    expect(screen.getByTestId('pending')).toHaveTextContent('pending: 35.0271,135.7982');
    expect(screen.getByTestId('view-request')).not.toHaveTextContent('view: none');

    await user.click(screen.getByRole('button', { name: 'Add as idea' }));

    // The kept toast, with its Undo.
    expect(await screen.findByText('Kept — Ginkaku-ji is on your map.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    // The new pin joins the list's reading immediately.
    expect(await screen.findByRole('button', { name: 'Ginkaku-ji (chip)' })).toBeInTheDocument();
    // The preview is spent: ring off, card gone.
    expect(screen.getByTestId('pending')).toHaveTextContent('pending: none');

    // What was stored is what the card showed: short name as title, full
    // label as address, the point, and the place category.
    const { entries } = await api.get<{ entries: Entry[] }>('/entries', {
      params: { trip_id: 1, kind: 'idea' },
    });
    const kept = entries.find((e) => e.title === 'Ginkaku-ji') as Entry;
    expect(kept.address).toBe('Ginkaku-ji, Sakyo Ward, Kyoto');
    expect(kept.lat).toBe(35.0271);
    expect(kept.lng).toBe(135.7982);
    expect(kept.category).toBe('place');
    expect(kept.parent_ids).toContain(1);
  });

  it('Undo archives the just-kept idea and its pin leaves the map', async () => {
    searchPlaceMock.mockResolvedValue([GINKAKUJI]);
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await searchTheMap(user, 'ginkaku');
    await user.click(await screen.findByRole('button', { name: /Ginkaku-ji, Sakyo Ward/ }));
    await user.click(screen.getByRole('button', { name: 'Add as idea' }));
    await screen.findByRole('button', { name: 'Ginkaku-ji (chip)' });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Ginkaku-ji (chip)' })).not.toBeInTheDocument(),
    );
  });

  it('a place already on the map raises the duplicate card, and "Show in list" selects the idea instead', async () => {
    // Nanzen-ji's own coordinates, under a geocoder label.
    searchPlaceMock.mockResolvedValue([
      { lat: 35.0116, lng: 135.7681, label: 'Nanzen-ji Temple, Kyoto', kind: 'attraction' },
    ]);
    const user = userEvent.setup();
    renderMap();
    await listUp();

    // 'temple' matches no idea title, so the only result is the place.
    await searchTheMap(user, 'temple');
    await user.click(await screen.findByRole('button', { name: /Nanzen-ji Temple/ }));

    expect(screen.getByText('already on your map')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show in list' }));

    // Selected and centred — steered back to what the board already holds.
    expect(screen.getByRole('checkbox', { name: 'Nanzen-ji' })).toBeChecked();
    expect(screen.getByText('1 idea selected')).toBeInTheDocument();
    expect(screen.getByTestId('view-request')).toHaveTextContent(`:${NANZENJI_ID}`);
    // The preview is gone with the choice made.
    expect(screen.queryByText('already on your map')).not.toBeInTheDocument();
    expect(screen.getByTestId('pending')).toHaveTextContent('pending: none');
  });

  it('"Add to a plan" creates the idea, links it into the plan, and says so', async () => {
    searchPlaceMock.mockResolvedValue([GINKAKUJI]);
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await searchTheMap(user, 'ginkaku');
    await user.click(await screen.findByRole('button', { name: /Ginkaku-ji, Sakyo Ward/ }));
    await user.click(screen.getByRole('button', { name: 'Add to a plan' }));
    await user.click(screen.getByRole('button', { name: MARKET_BUNDLE_TITLE }));

    expect(
      await screen.findByText(`Kept, and added to ${MARKET_BUNDLE_TITLE}. Still on your board too.`),
    ).toBeInTheDocument();

    // On the board (under the trip) AND in the plan — a link, not a move.
    const detail = await api.get<{ children: Entry[] }>(`/entries/${MARKET_BUNDLE_ID}`);
    expect(detail.children.map((child) => child.title)).toContain('Ginkaku-ji');
    const { entries } = await api.get<{ entries: Entry[] }>('/entries', {
      params: { trip_id: 1, kind: 'idea' },
    });
    expect(entries.find((e) => e.title === 'Ginkaku-ji')?.parent_ids).toContain(1);
  });

  it('the dead end offers the dropped pin, carrying the query as the working name', async () => {
    searchPlaceMock.mockResolvedValue([]);
    const user = userEvent.setup();
    renderMap();
    await listUp();

    await searchTheMap(user, 'that ramen bar');
    await user.click(await screen.findByRole('button', { name: 'Click where it is' }));

    // Aiming for a brand-new idea: the generic banner (nothing has a name the
    // map can vouch for yet).
    expect(screen.getByText('Click where it is')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Simulate map click' }));

    expect(screen.getByText('New idea from the map')).toBeInTheDocument();
    // The query travelled in as the editable name.
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('that ramen bar');

    await user.click(screen.getByRole('button', { name: 'Add as idea' }));

    expect(await screen.findByText('Kept — that ramen bar is on your map.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'that ramen bar (chip)' })).toBeInTheDocument();
  });
});

/**
 * Written in two halves on purpose: the first takes every capture affordance
 * away, the second asserts the reading half still works — a viewer page that
 * passed only the first half could be a blank page.
 */
describe('TripMap — as a viewer', () => {
  beforeEach(async () => {
    // Signed in and genuinely a viewer in the fixtures, not merely told to
    // render as one.
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(1, 1, 'viewer');
  });

  it('takes every way of capturing away', async () => {
    searchPlaceMock.mockResolvedValue([
      { lat: 35.0271, lng: 135.7982, label: 'Ginkaku-ji, Sakyo Ward, Kyoto', kind: 'attraction' },
    ]);
    const user = userEvent.setup();
    renderMap('viewer');
    await listUp();

    // No selection circles, no map-click handler for pin drops.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simulate map click' })).not.toBeInTheDocument();

    // The placeless footer reads, but offers no way to place.
    await user.click(screen.getByRole('button', { name: 'Show them ›' }));
    expect(screen.getByText('Coffee at Weekenders')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Put it on the map' })).not.toBeInTheDocument();

    // Search never offers Places (not-yours-yet is a door to a write).
    await searchTheMap(user, 'ginkaku');
    await waitFor(() => expect(searchPlaceMock).toHaveBeenCalled());
    expect(screen.queryByText('Places · not yours yet')).not.toBeInTheDocument();
  });

  it('keeps every way of reading', async () => {
    const user = userEvent.setup();
    renderMap('viewer');
    await listUp();

    // The list, the counter, the pins, the follow switch and the filters all stand.
    expect(screen.getByText('2 of 2 ideas on the map are in view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nanzen-ji (chip)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /follow map/ })).toBeInTheDocument();
    expect(screen.getByText(/Tick ideas in the list or click their pins/)).toBeInTheDocument();

    // Zoom-to still works: a name click is reading, not writing.
    await user.click(screen.getByRole('button', { name: 'Kiyamachi' }));
    expect(screen.getByTestId('view-request')).toHaveTextContent('view: 1:3');

    // Filters still narrow — from behind the Filter button, where the chips
    // now live.
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(screen.getByRole('button', { name: 'Scheduled' }));
    expect(screen.getByText('1 of 2 ideas on the map are in view')).toBeInTheDocument();
  });
});

/** A failed load is not an unpinned map — the screen must never claim nothing
 * is on it about places it simply could not fetch. */
describe('TripMap — when the load fails', () => {
  it('says the places failed to load instead of claiming the map is empty, and offers a way back', async () => {
    server.use(http.get('/api/entries', () => HttpResponse.json({ error: 'boom' }, { status: 500 })));
    renderMap();

    expect(
      await screen.findByText("Your places didn't load. Nothing is lost — every pin is still where you put it."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText(/Nothing on the map yet/)).not.toBeInTheDocument();
  });
});
