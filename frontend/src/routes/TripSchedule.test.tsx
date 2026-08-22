import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { ToastProvider } from '../components/Toast';
import { api } from '../api';
import { server } from '../mocks/server';
import { TripRoleProvider } from '../auth/TripRoleContext';
import { setRole } from '../mocks/db';
import { TripSchedule } from './TripSchedule';
import type { TripRole } from '../api/types';
import type { MapViewProps } from '../features/map/MapView';

/**
 * jsdom has no layout engine, so a real Leaflet map cannot be mounted here (see
 * MapView.tsx's own doc comment). The nearby panel draws one; the seam is
 * stubbed to something that only says it was asked to.
 */
vi.mock('../features/map/MapView', () => ({
  MapView: (props: MapViewProps) => (
    <div data-testid="map-view">
      {props.pins.map((pin) => (
        <p key={pin.id}>pin: {pin.title}</p>
      ))}
    </div>
  ),
}));

// Seeded trip 1 (src/mocks/db.ts): Nanzen-ji placed 09:00–09:40 on the first
// day, and the bundle "Nishiki market crawl" placed 11:00–13:00 on that same
// day with nothing chosen yet — which is the "decide on the night" row below.
// Its three members are already in the seed, so nothing here has to plant one.
const TRIP_ID = 1;
const FIRST_DAY = '2026-11-02';
/** The second day of the trip — 'TUE 3' on the strip, Teramachi at 11:00. */
const SECOND_DAY = '2026-11-03';
const BUNDLE_TITLE = 'Nishiki market crawl';
const OPTION = 'Coffee at Weekenders';

const NARROW_QUERY = '(max-width: 860px)';
const realMatchMedia = window.matchMedia;

/**
 * The screen mounts either the phone's full-screen sheet or the desktop rail,
 * never both, and it asks `matchMedia` which. jsdom answers "no match" to
 * everything, so a test that wants the phone has to say so.
 */
function viewport(width: 'narrow' | 'wide') {
  window.matchMedia = ((query: string) =>
    ({
      matches: query === NARROW_QUERY && width === 'narrow',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

// The schedule reads `trip` from useOutletContext, which only exists inside an
// <Outlet> — routed through a stand-in layout, the same shape TripLayout gives.
// The dates matter here: they are what the day strip is built from.
function TestTripLayout() {
  return (
    <Outlet
      context={{
        trip: { id: TRIP_ID, title: 'Six days in Kyoto', starts_on: FIRST_DAY, ends_on: '2026-11-08' },
      }}
    />
  );
}

/** `role` mounts the provider TripLayout mounts in the app. Omitted, there is
 * no provider and the context hands back its editable default. */
function renderSchedule(role?: TripRole) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const schedule = (
    <MemoryRouter initialEntries={['/trips/1/schedule']}>
      <Routes>
        <Route path="/trips/:id" element={<TestTripLayout />}>
          <Route path="schedule" element={<TripSchedule />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {role ? <TripRoleProvider role={role}>{schedule}</TripRoleProvider> : schedule}
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Tonight's choice, by the one line only it renders. Async because the
 * bundle's members arrive on a request of their own, and the group draws
 * nothing at all until they do. */
async function optionsGroup(): Promise<HTMLElement> {
  const eyebrow = await screen.findByText('Decide on the night');
  return eyebrow.closest('div') as HTMLElement;
}

describe('TripSchedule — the day as it stands', () => {
  beforeEach(() => viewport('wide'));

  it('draws each item as a flat row: when, how long and what', async () => {
    renderSchedule();

    expect(await screen.findByText('Nanzen-ji')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Final schedule', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('09:00–09:40')).toBeInTheDocument();
    expect(screen.getByText('40 min')).toBeInTheDocument();
    expect(screen.getByText('Place')).toBeInTheDocument();
  });

  /* The dot is a shape and says nothing on its own. A row whose choice nobody
     has made is the one state a reader most needs told. */
  it('says an undecided row is undecided, in words as well as in the dot', async () => {
    renderSchedule();

    await screen.findByText(BUNDLE_TITLE);
    expect(screen.getByText('not decided')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  /**
   * The half of the old screen that deliberately left. Editing the plan is the
   * Itinerary's job now, and this asserts it did not quietly stay behind: an
   * unscheduled tray, a "Place at…" modal and "Move back to ideas" were all
   * here, and a read surface has none of them.
   */
  it('offers no way to change the plan — editing lives on the itinerary now', async () => {
    renderSchedule();
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByRole('button', { name: 'Move back to ideas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Place at…' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ideas not yet placed')).not.toBeInTheDocument();
  });

  /**
   * TripLayout prints the trip's title above every trip screen as the page's
   * one <h1> — the stand-in layout in this file deliberately does not, so what
   * is asserted here is that this screen adds no second one. The itinerary
   * makes the same promise in TripItinerary.test.tsx.
   */
  it('leaves the trip’s title as the page’s only <h1>, with the schedule a section under it', async () => {
    renderSchedule();
    await screen.findByText('Nanzen-ji');

    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2, name: 'Final schedule' })).toBeInTheDocument();
  });

  it('says so plainly when a day has nothing on it', async () => {
    renderSchedule();
    await screen.findByText('Nanzen-ji');

    await userEvent.click(screen.getByRole('button', { name: 'THU 5' }));
    expect(await screen.findByText('Nothing placed yet. Drag something over from your ideas.')).toBeInTheDocument();
  });
});

describe('TripSchedule — the day strip', () => {
  beforeEach(() => viewport('wide'));

  it('carries every day of the trip, with the one you are reading marked', async () => {
    renderSchedule();

    const strip = await screen.findByRole('navigation', { name: 'Days' });
    expect(within(strip).getAllByRole('button')).toHaveLength(7);
    expect(within(strip).getByRole('button', { name: 'MON 2' })).toHaveAttribute('aria-current', 'true');
  });

  it('changes the day under it when you pick another one', async () => {
    renderSchedule();
    await screen.findByText(BUNDLE_TITLE);

    await userEvent.click(screen.getByRole('button', { name: 'TUE 3' }));

    expect(await screen.findByText('Teramachi arcade')).toBeInTheDocument();
    expect(screen.queryByText(BUNDLE_TITLE)).not.toBeInTheDocument();
  });
});

/**
 * Which day the screen opens on. The clock is frozen in every one of these:
 * "today" is the whole question, so no test here may ask the real one.
 */
describe('TripSchedule — the day it opens on', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function freeze(iso: string) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(iso));
  }

  it('opens on today while the trip is running, not on day one', async () => {
    viewport('wide');
    freeze(`${SECOND_DAY}T11:15:00`);
    renderSchedule();

    // The row's own time: "Teramachi arcade" is also what the now bar is
    // saying, and it is the day underneath that is being asserted here.
    expect(await screen.findByText('11:00–11:30')).toBeInTheDocument();
    const strip = await screen.findByRole('navigation', { name: 'Days' });
    expect(within(strip).getByRole('button', { name: 'TUE 3' })).toHaveAttribute('aria-current', 'true');
    // The point of landing here: the clock has something to say the moment the
    // page draws, instead of after the reader hunts for today's chip.
    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('opens on the first day before the trip has started', async () => {
    viewport('wide');
    freeze('2026-08-17T09:00:00');
    renderSchedule();

    await screen.findByText('Nanzen-ji');
    const strip = screen.getByRole('navigation', { name: 'Days' });
    expect(within(strip).getByRole('button', { name: 'MON 2' })).toHaveAttribute('aria-current', 'true');
  });

  it('opens on the first day again once the trip is over', async () => {
    viewport('wide');
    freeze('2027-01-04T09:00:00');
    renderSchedule();

    await screen.findByText('Nanzen-ji');
    const strip = screen.getByRole('navigation', { name: 'Days' });
    expect(within(strip).getByRole('button', { name: 'MON 2' })).toHaveAttribute('aria-current', 'true');
  });

  /**
   * The other half of opening on today: it is an opening, not a leash. Reading
   * ahead has to survive whatever redraws the page next — here, opening the
   * nearby sheet, which is a state change with no opinion about the day.
   */
  it('keeps the day you picked when something else redraws the page', async () => {
    viewport('narrow');
    freeze(`${SECOND_DAY}T11:15:00`);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSchedule();
    await screen.findByText('11:00–11:30');

    await user.click(screen.getByRole('button', { name: 'MON 2' }));
    expect(await screen.findByText(BUNDLE_TITLE)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "What's nearby" }));
    await screen.findByRole('dialog');

    expect(screen.getByText(BUNDLE_TITLE)).toBeInTheDocument();
    expect(screen.queryByText('11:00–11:30')).not.toBeInTheDocument();
    const strip = screen.getByRole('navigation', { name: 'Days' });
    expect(within(strip).getByRole('button', { name: 'MON 2' })).toHaveAttribute('aria-current', 'true');
  });
});

describe('TripSchedule — the now bar', () => {
  it('says what you are on and what is next', async () => {
    viewport('narrow');
    renderSchedule();
    await screen.findByText('Nanzen-ji');

    // The first day of the trip is not today, so the clock has no opinion and
    // the bar reads ahead instead.
    expect(screen.getByText('Nothing planned')).toBeInTheDocument();
    expect(screen.getByText('Next: Nanzen-ji at 09:00')).toBeInTheDocument();
  });

  it('is the phone’s way into what is nearby, and closes again', async () => {
    viewport('narrow');
    renderSchedule();
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByText('Around you now')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: "What's nearby" }));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Around you now')).toBeInTheDocument();
    expect(await within(sheet).findByText('Kiyamachi')).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/**
 * The two layouts of one panel. Whichever width you are at, exactly one of them
 * is mounted — a sheet rendered under the rail would put the same headings in
 * the accessibility tree twice and leave a dialog nobody opened behind the page.
 */
describe('TripSchedule — nearby, at both widths', () => {
  it('parks the panel beside the plan on a desk, with no sheet underneath it', async () => {
    viewport('wide');
    renderSchedule();
    await screen.findByText('Nanzen-ji');

    expect(await screen.findByText('Around you now')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('Around you now')).toHaveLength(1);
  });

  /**
   * The fallback used to be the mean of every located entry on the trip, which
   * is a point in the countryside on any trip that visits two cities: the 2km
   * search around it comes back empty and the panel loses its map along with
   * its list. Where the plan says you are is a real place, so it names it.
   */
  it('measures from where the plan puts you, and says so, when the browser will not say where you are', async () => {
    viewport('wide');
    renderSchedule();

    expect(
      await screen.findByText(
        "Your browser won't share your location, so this is measured from Nanzen-ji, where the plan has you.",
      ),
    ).toBeInTheDocument();
    // Kept, unplaced, and turned into minutes on foot rather than kilometres —
    // measured from Nanzen-ji, not from the middle of anything.
    expect(await screen.findByText('Activity · 8 min walk')).toBeInTheDocument();
    // And the panel is whole: a map with the pin on it, not just a sentence.
    expect(await screen.findByText('pin: Kiyamachi')).toBeInTheDocument();
  });

  /**
   * A refusal is only one of the ways to have no fix. Waiting on one — the
   * prompt still up, or nobody ever answering it — is the commonest, and it
   * used to leave the rail with no origin at all: no map, no list, a spinner
   * with no end. The plan's place stands in until the browser knows better,
   * and the sentence does not accuse the browser of refusing.
   */
  it('measures from the plan while the browser is still deciding, without calling it a refusal', async () => {
    viewport('wide');
    // A fix that never arrives: the request is made, and nothing answers it.
    const geolocation = { getCurrentPosition: vi.fn() };
    Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });

    try {
      renderSchedule();

      expect(await screen.findByText('Measured from Nanzen-ji, where the plan has you.')).toBeInTheDocument();
      expect(await screen.findByText('pin: Kiyamachi')).toBeInTheDocument();
      expect(screen.queryByText(/won't share your location/)).not.toBeInTheDocument();
      expect(geolocation.getCurrentPosition).toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, 'geolocation');
    }
  });

  it('keeps the rail off a phone entirely until the bar is asked', async () => {
    viewport('narrow');
    renderSchedule();
    await screen.findByText('Nanzen-ji');

    expect(screen.queryByText('Around you now')).not.toBeInTheDocument();
  });
});

describe('TripSchedule — tonight’s options', () => {
  beforeEach(() => viewport('wide'));

  it('lets you choose one on the night, and change your mind', async () => {
    renderSchedule();
    await screen.findByText(BUNDLE_TITLE);

    const option = () => within(screen.getByText('Decide on the night').closest('div') as HTMLElement)
      .getByRole('button', { name: new RegExp(OPTION) });

    await optionsGroup();
    expect(option()).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(option());
    await vi.waitFor(() => expect(option()).toHaveAttribute('aria-pressed', 'true'));

    // A second tap on the same option puts the question back.
    await userEvent.click(option());
    await vi.waitFor(() => expect(option()).toHaveAttribute('aria-pressed', 'false'));
  });
});

/**
 * Written in two halves on purpose: the first asserts the affordances are gone,
 * the second asserts the plan is still all there. A test with only the first
 * half passes on a blank page, which is the one outcome read-only mode must
 * never produce.
 */
describe('TripSchedule — as a viewer', () => {
  beforeEach(async () => {
    viewport('wide');
    // Signed in and genuinely a viewer in the fixtures, not merely told to
    // render as one.
    await api.post('/session', { email: 'demo@wend.app', password: 'password' });
    setRole(TRIP_ID, 1, 'viewer');
  });

  it('takes the choice away without taking the options away', async () => {
    renderSchedule('viewer');
    await screen.findByText(BUNDLE_TITLE);

    // Waited for first, so this cannot pass on a group whose members simply had
    // not arrived yet.
    const group = await optionsGroup();
    expect(within(group).getByText(OPTION)).toBeInTheDocument();
    expect(within(group).queryByRole('button')).not.toBeInTheDocument();
  });

  it('leaves the whole day, its states and its options on screen', async () => {
    renderSchedule('viewer');

    // The plan is the thing a viewer came to read: the row, its time, its meta.
    expect(await screen.findByText('Nanzen-ji')).toBeInTheDocument();
    expect(screen.getByText('09:00–09:40')).toBeInTheDocument();
    expect(screen.getByText('Place')).toBeInTheDocument();
    // The days are reading, not editing — the strip stays.
    expect(screen.getByRole('navigation', { name: 'Days' })).toBeInTheDocument();
    // And the choice, unmade, with every option still readable.
    const group = await optionsGroup();
    expect(within(group).getByText(OPTION)).toBeInTheDocument();
    expect(within(group).getByText('Teramachi arcade')).toBeInTheDocument();
  });

  it('gives the choice back to a member', async () => {
    setRole(TRIP_ID, 1, 'member');
    renderSchedule('member');
    await screen.findByText(BUNDLE_TITLE);

    const group = await optionsGroup();
    expect(within(group).getByRole('button', { name: new RegExp(OPTION) })).toBeInTheDocument();
  });
});

/**
 * The clock, frozen. Everything time-dependent on this screen takes an explicit
 * `now` read once per render, so freezing the system clock is enough to put the
 * traveller in the middle of the first morning of the trip.
 */
describe('TripSchedule — on the day itself', () => {
  beforeEach(() => {
    viewport('wide');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(`${FIRST_DAY}T09:20:00`));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the row you are standing in and reads the rest of the morning off it', async () => {
    renderSchedule();
    await screen.findByText('09:00–09:40');

    expect(screen.getByText('now')).toBeInTheDocument();
    expect(screen.getByText(`Until 09:40 · then ${BUNDLE_TITLE} at 11:00`)).toBeInTheDocument();
    // The panel is up beside the row. It does not claim to know the name of the
    // place you are standing on — the sentence under the heading says what the
    // distances are measured from (its own tests, above).
    expect(await screen.findByRole('heading', { name: 'Around you now', level: 2 })).toBeInTheDocument();
  });
});

/** A failed load is not an unplanned day — "Nothing placed yet" must never
 * stand in for a plan the screen simply could not fetch. */
describe('TripSchedule — when the load fails', () => {
  it('says the plan failed to load instead of claiming the day is empty, and offers a way back', async () => {
    server.use(
      http.get('/api/trips/:tripId/schedule', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    );
    renderSchedule();

    expect(
      await screen.findByText("Your plan didn't load. Nothing is lost — everything you've placed is still in it."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText(/Nothing placed/)).not.toBeInTheDocument();
  });
});
