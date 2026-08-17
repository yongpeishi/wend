import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { setRole } from '../mocks/db';
import { TripBoard } from './TripBoard';
import type { TripRole } from '../api/types';
import type { MapViewProps } from '../features/map/MapView';

/**
 * The shared fixture grew with the itinerary work — seven ideas across two
 * populated bundles, where the board used to see two ideas and an empty one —
 * so every render in this file paints several times the DOM it did, and the map
 * cases string half a dozen user events on top of that. The 5s default is no
 * longer comfortable here on a loaded machine; nothing about these tests is
 * meant to be a performance assertion.
 */
vi.setConfig({ testTimeout: 15_000 });

/**
 * jsdom has no layout engine, so a real Leaflet map cannot be mounted here (see
 * MapView.tsx's own doc comment) — the seam is mocked to a stub that exposes
 * every prop this route wires up: the pins with the tone the board decided for
 * them, the fit nonce, and buttons that fire the callbacks a pan / a pin / a
 * cluster would fire. That is the whole point: the wiring under test is the
 * board's, not Leaflet's, and the clustering and bounds maths it leans on are
 * unit-tested directly in src/features/map/.
 *
 * The stub deliberately does NOT report bounds on mount, the way the real map
 * does. That keeps "the map is open but has not said where it is looking yet"
 * as a state these tests pass through, which is exactly the frame where a
 * careless `mapOpen && followMap` check would cut the list against nothing.
 */
vi.mock('../features/map/MapView', () => ({
  MapView: (props: MapViewProps) => (
    <div data-testid="map-view">
      <p data-testid="fit-request">fit: {String(props.fitRequest)}</p>
      <p data-testid="pin-selected">selected: {String(props.selectedId)}</p>
      <ul>
        {props.pins.map((pin) => (
          <li key={pin.id}>
            <button type="button" onClick={() => props.onSelectPin?.(pin.id)}>
              {pin.title} ({pin.tone})
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => props.onBoundsChange?.({ north: 35.02, south: 35.01, east: 135.78, west: 135.76 })}
      >
        Simulate pan to Nanzen-ji only
      </button>
      <button type="button" onClick={() => props.onSelectCluster?.(props.pins.map((pin) => pin.id))}>
        Simulate cluster click
      </button>
    </div>
  ),
}));

// The board reads `trip` from useOutletContext, which only exists inside an
// <Outlet> — routed through a stand-in layout, the same shape TripLayout gives.
function TestTripLayout() {
  return <Outlet context={{ trip: { id: 1, title: 'Six days in Kyoto' } }} />;
}

/**
 * `role` mounts the provider TripLayout mounts in the app. Omitted, there is no
 * provider at all and the context hands back its editable default — which is
 * what every test below this line was written against and must stay true for:
 * a board outside a trip is nobody's but yours.
 */
function renderBoard(role?: TripRole) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const board = (
    <MemoryRouter initialEntries={['/trips/1']}>
      <Routes>
        <Route path="/trips/:id" element={<TestTripLayout />}>
          <Route index element={<TripBoard />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {role ? <TripRoleProvider role={role}>{board}</TripRoleProvider> : board}
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/**
 * Seeded trip 1 (src/mocks/db.ts) holds SEVEN ideas, and only two of them are
 * located: Nanzen-ji (place, 35.0116/135.7681) and Kiyamachi (activity,
 * 35.0086/135.7717). The other five are bundle members the itinerary fixture
 * needs, and it gives them no coordinates on purpose — they are things to do,
 * not places to pin. That asymmetry is why the counts below run "6 of 7": the
 * viewport can only ever cut the located pair, so five ideas are permanently
 * un-cuttable and the map's own count line is doing real arithmetic rather than
 * splitting a two-item list in half.
 *
 * The simulated pan above is a box around Nanzen-ji alone — Kiyamachi sits just
 * south of it. Kiyamachi is also a member of "A night out in Pontocho", so its
 * pin reads `bundled` whatever the viewport is doing; a test that needs an
 * unbundled located idea adds one of its own.
 */
const TRIP_ID = 1;
const NANZENJI_ID = 2;
const MARKET_BUNDLE_ID = 4;
const MARKET_BUNDLE_TITLE = 'Nishiki market crawl';

/**
 * Pin buttons carry their tone in the label, so a pin is matched by prefix
 * wherever the tone is not what is under test. That is not fussiness: the mock
 * database's `seed()` re-seeds `db.entries` but never clears `db.links` (see
 * src/mocks/db.ts), so a link created by one test is still there in the next
 * one and can turn a pin "bundled" from a distance. Matching on the title alone
 * keeps every test that is not about tone independent of what ran before it.
 */
function pin(title: string): RegExp {
  return new RegExp(`^${title} \\(`);
}

async function addIdea(entry: Record<string, unknown>) {
  await api.post('/entries', { entry: { kind: 'idea', ...entry }, parent_id: TRIP_ID });
}

/** Set aside every idea on the trip except the named one — read off the API
 * rather than off a list of seeded ids, so it keeps telling the truth as the
 * shared fixture grows. */
async function setAsideEverythingBut(keptTitle: string) {
  const { entries } = await api.get<{ entries: { id: number; title: string }[] }>('/entries', {
    params: { trip_id: TRIP_ID, kind: 'idea' },
  });
  for (const entry of entries.filter((e) => e.title !== keptTitle)) {
    await api.delete(`/entries/${entry.id}`);
  }
}

/**
 * The ideas column on its own. The bundle rail on the right lists each bundle's
 * members by title, and six of this trip's seven ideas are in a bundle — so an
 * unscoped `getByText('Kiyamachi')` matches twice, and only one of the two is
 * the list the map is narrowing. Anything asking "is this idea still in the
 * list?" has to ask it of this element.
 */
function ideas(): HTMLElement {
  return screen.getByRole('region', { name: 'Ideas' });
}

/**
 * Wait for the map — every map assertion starts here. It no longer opens
 * anything: the board paints with the map already up, so what used to be a
 * click is now only the wait for the pane to arrive alongside the ideas.
 */
async function mapUp() {
  return screen.findByTestId('map-view');
}

describe('TripBoard — showing and hiding the map', () => {
  // The default the board now opens on. Where a trip's ideas ARE is half of
  // what the board has to say about them, and a map behind a button is a map
  // nobody presses — so the pane, and the switch that binds the list to it, are
  // both on screen before anyone asks.
  it('paints with the map already up', async () => {
    renderBoard();
    await screen.findByText('Nanzen-ji');

    expect(screen.getByTestId('map-view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide map' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Follow the map' })).toBeInTheDocument();
  });

  // What the old default asserted from the other side, and still the rule: with
  // no map on screen there is no viewport, so the follow switch has nothing on
  // the far end of it and goes too. Asking for the map back brings both.
  it('takes the follow switch away with the map, and gives both back', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Hide map' }));

    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Follow the map' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show map' }));

    expect(await mapUp()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide map' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Follow the map' })).toBeInTheDocument();
  });

  // Two things at once, and both matter: the map really unmounts (a hidden
  // Leaflet container comes back as grey tiles), and the viewport it was
  // reporting is forgotten, so the list is whole again.
  it('unmounts the map when it is hidden, and gives the whole list back', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));
    expect(await screen.findByText(/6 of 7 ideas in view/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide map' }));

    expect(screen.queryByTestId('map-view')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 7 of 7/)).toBeInTheDocument();
    expect(within(ideas()).getByText('Kiyamachi')).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Follow the map' })).not.toBeInTheDocument();
  });

  // The frame between "the map mounted" and "the map said where it is": with no
  // bounds yet there is nothing to cut against, and the list must be untouched.
  it('does not cut the list before the map has reported a view', async () => {
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    expect(screen.getByText(/Showing 7 of 7/)).toBeInTheDocument();
    expect(within(ideas()).getByText('Kiyamachi')).toBeInTheDocument();
  });
});

describe('TripBoard — the map narrows the list', () => {
  it('panning cuts the list to what is in view and says so on one count line', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));

    expect(await screen.findByText(/6 of 7 ideas in view/)).toBeInTheDocument();
    expect(screen.getByText(/1 just off-screen/)).toBeInTheDocument();
    // One line, not two: the old phrasing is gone rather than sitting under it.
    expect(screen.queryByText(/Showing 7 of 7/)).not.toBeInTheDocument();
    expect(within(ideas()).queryByText('Kiyamachi')).not.toBeInTheDocument();
  });

  it('says on the map how much is outside the view, and pluralises it properly', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    const map = screen.getByTestId('map-view').parentElement as HTMLElement;
    expect(within(map).getByText('Everything kept is in view')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));

    // "1 idea", never the mockup's "1 ideas".
    expect(await within(map).findByText('1 idea outside this view')).toBeInTheDocument();
  });

  // Switching follow off is the way back to the wider set without moving the
  // map — so the list widens, and the map says why panning has stopped biting.
  it('switching "Follow the map" off stops the narrowing', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();
    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));
    await screen.findByText(/6 of 7 ideas in view/);

    await user.click(screen.getByRole('switch', { name: 'Follow the map' }));

    expect(await screen.findByText(/Showing 7 of 7/)).toBeInTheDocument();
    expect(within(ideas()).getByText('Kiyamachi')).toBeInTheDocument();
    expect(screen.getByText('The list is not following the map')).toBeInTheDocument();
  });

  it('offers "Widen" whenever anything is off-screen, follow switch or no follow switch', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    // Nothing is off-screen yet, so there is nothing to widen back to.
    expect(screen.queryByRole('button', { name: 'Widen' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));
    expect(await screen.findByRole('button', { name: 'Widen' })).toBeInTheDocument();

    // It moves the map, not the list, so it survives the list letting go.
    await user.click(screen.getByRole('switch', { name: 'Follow the map' }));
    expect(screen.getByRole('button', { name: 'Widen' })).toBeInTheDocument();
  });

  it('"Widen" asks the map to re-fit to every pin', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();
    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));

    expect(screen.getByTestId('fit-request')).toHaveTextContent('fit: 0');
    await user.click(screen.getByRole('button', { name: 'Widen' }));
    expect(screen.getByTestId('fit-request')).toHaveTextContent('fit: 1');
  });

  // The one rule the viewport must never break.
  it('never hides an idea that has no location', async () => {
    await addIdea({ title: 'Buy a rail pass', category: 'transport' });
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Buy a rail pass');
    await mapUp();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));

    // Eight ideas now, and the pan puts exactly one of them — Kiyamachi, the
    // only located idea outside the box — off-screen. The brand-new one has no
    // coordinates at all, so it stays whatever the map is looking at.
    expect(await screen.findByText(/7 of 8 ideas in view/)).toBeInTheDocument();
    expect(screen.getByText('Buy a rail pass')).toBeInTheDocument();
    expect(within(ideas()).queryByText('Kiyamachi')).not.toBeInTheDocument();
  });

  // Panning somewhere empty is a normal thing to do, and an empty column under a
  // count line reads as a page that failed to load.
  it('says something when the view holds nothing at all', async () => {
    // The viewport only ever cuts LOCATED ideas, so emptying the list means
    // setting aside everything a pan cannot touch: the five coordinate-free
    // ideas, plus Nanzen-ji, the one located idea inside the simulated box.
    // Kiyamachi is left standing and off-screen, so the list is empty because of
    // where the map is looking and not because the trip is.
    await setAsideEverythingBut('Kiyamachi');
    const user = userEvent.setup();
    renderBoard();
    await within(ideas()).findByText('Kiyamachi');
    await mapUp();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));

    expect(
      await screen.findByText('Nothing kept is in this part of the map. Pan somewhere else, or widen the view.'),
    ).toBeInTheDocument();
  });
});

describe('TripBoard — the pins', () => {
  it('draws a pin per located idea, toned by where it stands', async () => {
    // Of the fixture's two located ideas one is already bundled (Kiyamachi), so
    // a third, unbundled place west of the simulated box is what gives the
    // view-dependent tones something to move between.
    await addIdea({ title: 'Arashiyama bamboo grove', category: 'place', lat: 35.017, lng: 135.672 });
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Arashiyama bamboo grove');
    await mapUp();

    // Three located ideas, three pins, and no more: the five coordinate-free
    // ideas on this trip are on the list only.
    expect(screen.getAllByRole('button', { name: /\((inView|offView|bundled)\)$/ })).toHaveLength(3);
    // No viewport reported yet, so nothing can be off-view — but "bundled" is a
    // fact about the idea, not about the map, and is already true.
    expect(screen.getByRole('button', { name: 'Nanzen-ji (inView)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arashiyama bamboo grove (inView)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiyamachi (bundled)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));

    // Cut from the list, still on the map — panning must not delete the pins
    // you are panning towards.
    expect(await screen.findByRole('button', { name: 'Arashiyama bamboo grove (offView)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nanzen-ji (inView)' })).toBeInTheDocument();
    // Kiyamachi is outside the box too, and bundled still wins the tone.
    expect(screen.getByRole('button', { name: 'Kiyamachi (bundled)' })).toBeInTheDocument();
  });

  it('tones an already-bundled idea as bundled, whatever the view is doing', async () => {
    await api.post(`/entries/${MARKET_BUNDLE_ID}/links`, { child_id: NANZENJI_ID });
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    expect(await screen.findByRole('button', { name: 'Nanzen-ji (bundled)' })).toBeInTheDocument();
  });

  it('a pin click marks the idea it belongs to', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    expect(screen.getByTestId('pin-selected')).toHaveTextContent('selected: null');
    await user.click(screen.getByRole('button', { name: pin('Nanzen-ji') }));
    expect(screen.getByTestId('pin-selected')).toHaveTextContent(`selected: ${NANZENJI_ID}`);
  });

  // "Clicking a pin ticks its row" — the reason a bundle can be built from
  // either side of the screen.
  it('a pin click picks the idea while the board is selecting', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();
    await user.click(screen.getByRole('button', { name: 'Select' }));

    await user.click(screen.getByRole('button', { name: pin('Nanzen-ji') }));

    expect(screen.getByRole('checkbox', { name: 'Select Nanzen-ji' })).toBeChecked();
    expect(screen.getByText('1 idea selected')).toBeInTheDocument();
  });

  // A selection nobody can see is a selection nobody can correct, so opening a
  // cluster turns the mode on as well as picking.
  it('opening a cluster picks its ideas and turns select mode on', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');
    await mapUp();

    await user.click(screen.getByRole('button', { name: 'Simulate cluster click' }));

    expect(await screen.findByText('2 ideas selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done selecting' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Nanzen-ji' })).toBeChecked();
  });
});

describe('TripBoard — select mode', () => {
  it('shows the pick circles only while selecting, and drops the picks on the way out', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByRole('checkbox', { name: 'Select Nanzen-ji' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Nanzen-ji' }));
    expect(screen.getByText('1 idea selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done selecting' }));

    expect(screen.queryByRole('checkbox', { name: 'Select Nanzen-ji' })).not.toBeInTheDocument();
    expect(screen.queryByText('1 idea selected')).not.toBeInTheDocument();
  });

  it('adds the picked ideas to a bundle, then puts the board back the way it was', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Nanzen-ji' }));
    await user.click(screen.getByRole('button', { name: 'Add to a bundle' }));
    await user.click(screen.getByRole('button', { name: MARKET_BUNDLE_TITLE }));

    expect(await screen.findByText(`Added 1 idea to ${MARKET_BUNDLE_TITLE}.`)).toBeInTheDocument();
    // The ideas have gone where they were going, so the mode ends with them.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument());
    expect(screen.queryByText('1 idea selected')).not.toBeInTheDocument();

    const bundle = await api.get<{ children: { id: number }[] }>(`/entries/${MARKET_BUNDLE_ID}`);
    expect(bundle.children.map((child) => child.id)).toContain(NANZENJI_ID);
  });

  // Neither of these two is in the mockup's action bar. Taking two working
  // verbs away to match a picture would be a regression, not a tidy-up. The
  // labels have since been rewritten to name their consequence rather than the
  // gesture — "Lift out" became "Make separate trips", "Set aside" became
  // "Move to Set aside", the destination the board's own disclosure names.
  it('keeps "Make separate trips" and "Move to Set aside" beside the bundle action', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Nanzen-ji');

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Nanzen-ji' }));

    expect(screen.getByRole('button', { name: 'Make separate trips' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to Set aside' })).toBeInTheDocument();
  });
});

describe('TripBoard — filters compose with the map', () => {
  it('a category chip narrows the list and the pins together, and stays multi-select', async () => {
    await addIdea({ title: 'Ramen alley', category: 'food', lat: 35.0116, lng: 135.7681 });
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Ramen alley');
    await mapUp();

    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(screen.getByRole('button', { name: 'Place' }));

    // Eight ideas on the trip; Nanzen-ji is the only "place" among them.
    expect(await screen.findByText(/Showing 1 of 8/)).toBeInTheDocument();
    // Off the list AND off the map: one narrowing, both halves of the screen.
    expect(screen.queryByText('Ramen alley')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: pin('Ramen alley') })).not.toBeInTheDocument();

    // A second chip adds to the first rather than replacing it — the 012
    // behaviour, still intact with the map up. Food adds Ramen alley and the
    // three seeded eating ideas to the one place.
    await user.click(screen.getByRole('button', { name: 'Food' }));
    expect(await screen.findByText(/Showing 5 of 8/)).toBeInTheDocument();
    expect(screen.getByText('Ramen alley')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: pin('Ramen alley') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: pin('Nanzen-ji') })).toBeInTheDocument();
  });

  it('stacks the viewport cut on top of the chips', async () => {
    // Same category as Nanzen-ji, but far outside the simulated view.
    await addIdea({ title: 'Somewhere far away', category: 'place', lat: 10, lng: 10 });
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Somewhere far away');
    await mapUp();

    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(screen.getByRole('button', { name: 'Place' }));
    // Two "place" ideas out of the trip's eight: Nanzen-ji and the new one.
    await screen.findByText(/Showing 2 of 8/);

    await user.click(screen.getByRole('button', { name: 'Simulate pan to Nanzen-ji only' }));

    expect(await screen.findByText(/1 of 2 ideas in view/)).toBeInTheDocument();
    expect(screen.queryByText('Somewhere far away')).not.toBeInTheDocument();
    // And the way out of the chips is still on the same line.
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });
});

/**
 * The test this whole slice exists for. It is written in two halves on purpose:
 * the first asserts the affordances are gone, and the second asserts every idea
 * is still on the screen. A test with only the first half passes on a blank
 * page, which is the one outcome read-only mode must never produce.
 */
describe('TripBoard — as a viewer', () => {
  beforeEach(async () => {
    // Signed in and genuinely a viewer in the fixtures, not merely told to
    // render as one: GET /api/entries answers exactly as the app will see it.
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(TRIP_ID, 1, 'viewer');
  });

  it('takes every way of changing the board away', async () => {
    renderBoard('viewer');
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByRole('button', { name: /new idea/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new bundle/i })).not.toBeInTheDocument();
    // The row's actions menu and its drag handle, by their real accessible names.
    expect(screen.queryByRole('button', { name: 'Actions for Nanzen-ji' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Drag Nanzen-ji onto a bundle to add it there' }),
    ).not.toBeInTheDocument();
    // Select mode only ever led to a bar of edits, so the way in goes with them.
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
  });

  it('still shows every idea, every bundle and every count', async () => {
    renderBoard('viewer');

    await screen.findByText('Nanzen-ji');
    // Scoped to the ideas column: the bundle rail lists members by title too --
    // see `ideas()`.
    expect(within(ideas()).getByText('Nanzen-ji')).toBeInTheDocument();
    expect(within(ideas()).getByText('Kiyamachi')).toBeInTheDocument();
    expect(screen.getByText('A night out in Pontocho')).toBeInTheDocument();
    expect(screen.getByText(/Showing 7 of 7/)).toBeInTheDocument();
  });

  // Filtering, grouping and the map decide what is on screen, which is the whole
  // of what reading along is. None of them may be taken away with the edits.
  it('keeps every way of looking at the board', async () => {
    const user = userEvent.setup();
    renderBoard('viewer');
    await screen.findByText('Nanzen-ji');

    await mapUp();
    expect(screen.getByRole('switch', { name: 'Follow the map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: pin('Nanzen-ji') })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filter/ }));
    await user.click(screen.getByRole('button', { name: 'Place' }));
    // Of the seed's two "place" ideas only Nanzen-ji is located, so the open
    // map's viewport cut stacks on the chip and leaves one of the seven.
    expect(await screen.findByText(/Showing 1 of 7/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });

  // dnd-kit does not care how a row is styled, so the sensors are the kill
  // switch — and the grip is the only draggable the board draws. With neither
  // there is nothing left to start a drag from, by pointer or by keyboard.
  it('leaves nothing on the board that a drag could start from', async () => {
    renderBoard('viewer');
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByRole('button', { name: /^Drag / })).not.toBeInTheDocument();
  });

  it('gives the whole board back to a member', async () => {
    setRole(TRIP_ID, 1, 'member');
    renderBoard('member');
    await screen.findByText('Nanzen-ji');

    expect(screen.getByRole('button', { name: '+ New idea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Nanzen-ji' })).toBeInTheDocument();
  });
});
